// Prepares the game's sounds. Run with: npm run prepare-audio (then npm run prepare-art to refresh the manifest
// if you added or removed a file).
//
// Reads the originals from art-source/audio/ and writes the game's copies to public/assets/audio/ (same names),
// smaller for phones (v0.6.2): music and ambience are what the game streams in when they first play, and every
// sound is decoded into memory in full (a 4-minute stereo track is about 80 MB decoded), so length and channels
// matter as much as the file size.
//   - music_*         96 kbps (stereo kept)
//   - ambient_*       96 kbps mono (background beds)
//   - LOOPS           long looping effects: 96 kbps mono
//   - CLIPS           effects the game only ever plays the start of (playSfxClip's maxSeconds), or voice lines cropped
//                     by request: trimmed to that, with a short fade so the cut never clicks
//   - other effects   re-encoded at 128 kbps only if the original is higher; otherwise copied as is
// Uses the `ffmpeg-static` dev dependency.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import ffmpeg from 'ffmpeg-static';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'art-source', 'audio');
const OUT = path.join(ROOT, 'public', 'assets', 'audio');

const LOOPS = new Set(['sfx_bomber_flying', 'sfx_ra_beam', 'sfx_hero_snore', 'sfx_catapult_pool']);
// Seconds kept: a little past the longest maxSeconds the game plays them for (GameScene).
const CLIPS = { sfx_patapim_quake: 2.5, sfx_pork_call: 3.8, sfx_skeleton_rage: 2.8, sfx_lirili_voice: 3 };
const FADE = 0.15;
// Tracks that end abruptly in the original: a quick fade-out over their last seconds (v0.15: the startup jingle).
const FADE_OUT = { music_startup_jingle: 0.35 };
// Effects whose original starts (and ends) with near-silence: trimmed to where the sound really is, so they play the
// moment they're triggered (v0.15.2: the guide message sound had 0.75 s of hiss before its chime). A 5 ms fade-in
// keeps the cut from clicking.
const TRIM_SILENCE = new Set(['sfx_guide_message']);
const TRIM_FILTER = 'silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-55dB,areverse,afade=t=in:d=0.005';

const probe = (file) => {
  let out = '';
  try { execFileSync(ffmpeg, ['-hide_banner', '-i', file], { stdio: 'pipe' }); } catch (e) { out = String(e.stderr || ''); }
  const kbps = Number((/bitrate: (\d+) kb\/s/.exec(out) || [])[1] || 0);
  const [, h, m, s] = /Duration: (\d+):(\d+):([\d.]+)/.exec(out) || [0, 0, 0, 0];
  return { kbps, seconds: Number(h) * 3600 + Number(m) * 60 + Number(s) };
};

const encode = (src, dst, args) => execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-i', src, '-map_metadata', '-1', ...args, dst]);

fs.mkdirSync(OUT, { recursive: true });
let before = 0, after = 0;
for (const name of fs.readdirSync(SRC).sort()) {
  const ext = path.extname(name).toLowerCase();
  if (!['.mp3', '.ogg', '.wav'].includes(ext)) continue;
  const key = path.basename(name, ext);
  const src = path.join(SRC, name), dst = path.join(OUT, name);
  const { kbps } = probe(src);
  let how;
  if (ext !== '.mp3') { fs.copyFileSync(src, dst); how = 'copied'; }
  else if (key.startsWith('music_')) {
    const fade = FADE_OUT[key] ? ['-af', `afade=t=out:st=${(probe(src).seconds - FADE_OUT[key]).toFixed(2)}:d=${FADE_OUT[key]}`] : [];
    encode(src, dst, [...fade, '-c:a', 'libmp3lame', '-b:a', '96k', '-ar', '44100']);
    how = fade.length ? `96k, ${FADE_OUT[key]} s fade-out` : '96k';
  }
  else if (key.startsWith('ambient_') || LOOPS.has(key)) { encode(src, dst, ['-c:a', 'libmp3lame', '-b:a', '96k', '-ar', '44100', '-ac', '1']); how = '96k mono'; }
  else if (CLIPS[key]) {
    const t = CLIPS[key];
    encode(src, dst, ['-t', String(t), '-af', `afade=t=out:st=${(t - FADE).toFixed(2)}:d=${FADE}`, '-c:a', 'libmp3lame', '-b:a', '128k']);
    how = `trimmed to ${t} s`;
  } else if (TRIM_SILENCE.has(key)) {
    encode(src, dst, ['-af', TRIM_FILTER, '-c:a', 'libmp3lame', '-b:a', '128k']);
    how = 'trimmed (silence at both ends)';
  } else if (kbps > 128) { encode(src, dst, ['-c:a', 'libmp3lame', '-b:a', '128k']); how = '128k'; }
  else { fs.copyFileSync(src, dst); how = 'copied'; }
  // An original that was already small (a low bitrate) can come out bigger: keep it as is, unless it's trimmed
  // or made mono (those save memory once it's decoded, whatever the file size).
  if (how !== 'copied' && !how.startsWith('trimmed') && !how.includes('mono') && !how.includes('fade') && fs.statSync(dst).size >= fs.statSync(src).size) {
    fs.copyFileSync(src, dst);
    how = 'copied (re-encoding was no smaller)';
  }
  const a = fs.statSync(src).size, b = fs.statSync(dst).size;
  before += a; after += b;
  console.log(`  ${key.padEnd(28)} ${String(Math.round(a / 1024)).padStart(6)} KB -> ${String(Math.round(b / 1024)).padStart(6)} KB  (${how})`);
}
console.log(`\nAudio: ${(before / 1048576).toFixed(1)} MB -> ${(after / 1048576).toFixed(1)} MB`);
