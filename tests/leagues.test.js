import { describe, it, expect } from 'vitest';
import { LEAGUES, leagueFor, nextLeague, promotion } from '../src/logic/leagues.js';

describe('leagues', () => {
  it('six leagues, from Bronze to WarLord, in rising order', () => {
    expect(LEAGUES.map((l) => l.name)).toEqual(['Bronze', 'Silver', 'Gold', 'Crystal', 'Champion', 'WarLord']);
    for (let i = 1; i < LEAGUES.length; i++) expect(LEAGUES[i].minWave).toBeGreaterThan(LEAGUES[i - 1].minWave);
  });

  it('a league comes from the furthest wave survived', () => {
    expect(leagueFor(0)).toBe(null);
    expect(leagueFor(undefined)).toBe(null);
    expect(leagueFor(1)).toBe(null);          // no league below Bronze (wave 5)
    expect(leagueFor(4)).toBe(null);
    expect(leagueFor(5).key).toBe('bronze');
    expect(leagueFor(19).key).toBe('bronze');
    expect(leagueFor(20).key).toBe('silver');
    expect(leagueFor(40).key).toBe('gold');
    expect(leagueFor(69).key).toBe('gold');
    expect(leagueFor(70).key).toBe('crystal');
    expect(leagueFor(109).key).toBe('crystal');
    expect(leagueFor(110).key).toBe('champion');
    expect(leagueFor(159).key).toBe('champion');
    expect(leagueFor(160).key).toBe('warlord');
    expect(leagueFor(999).key).toBe('warlord');
  });

  it('knows the next league and when a new one is reached', () => {
    expect(nextLeague(0).key).toBe('bronze');
    expect(nextLeague(25)).toMatchObject({ key: 'gold', minWave: 40 });
    expect(nextLeague(200)).toBe(null);
    expect(promotion(0, 4)).toBe(null);
    expect(promotion(4, 5).key).toBe('bronze');
    expect(promotion(19, 20).key).toBe('silver');
    expect(promotion(20, 21)).toBe(null);
    expect(promotion(30, 30)).toBe(null);
  });
});
