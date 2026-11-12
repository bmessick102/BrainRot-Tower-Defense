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
    expect(leagueFor(1).key).toBe('bronze');
    expect(leagueFor(3).key).toBe('bronze');
    expect(leagueFor(4).key).toBe('silver');
    expect(leagueFor(9).key).toBe('gold');
    expect(leagueFor(10).key).toBe('crystal');
    expect(leagueFor(24).key).toBe('champion');
    expect(leagueFor(25).key).toBe('warlord');
    expect(leagueFor(999).key).toBe('warlord');
  });

  it('knows the next league and when a new one is reached', () => {
    expect(nextLeague(0).key).toBe('bronze');
    expect(nextLeague(5)).toMatchObject({ key: 'gold', minWave: 7 });
    expect(nextLeague(30)).toBe(null);
    expect(promotion(0, 1).key).toBe('bronze');
    expect(promotion(3, 4).key).toBe('silver');
    expect(promotion(4, 5)).toBe(null);
    expect(promotion(5, 5)).toBe(null);
  });
});
