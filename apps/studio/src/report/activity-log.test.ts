import { beforeEach, describe, expect, it } from 'vitest';
import { forgetActivity, readActivity, recordActivity } from './activity-log.js';
import { reportBody } from './report-body.js';

describe('the story of what was done', () => {
  beforeEach(forgetActivity);

  it('keeps lines in order, each stamped with how long into the session', () => {
    recordActivity('click', 'Extrude');
    recordActivity('edit', 'Add extrude');
    const [first, second] = readActivity();
    expect(first).toMatch(/^\d{3}:\d{2} click Extrude$/);
    expect(second).toMatch(/ edit Add extrude$/);
  });

  it('counts a repeated line once, and keeps only the end when asked', () => {
    recordActivity('click', 'Fit');
    recordActivity('click', 'Fit');
    recordActivity('click', 'Home');
    expect(readActivity()).toHaveLength(2);
    expect(readActivity(1)[0]).toMatch(/Home$/);
  });

  it('drops the oldest past its limit, so it cannot grow into a problem of its own', () => {
    for (let i = 0; i < 700; i++) recordActivity('click', `button ${String(i)}`);
    expect(readActivity()).toHaveLength(600);
    expect(readActivity()[0]).toMatch(/button 100$/);
  });

  it('goes into a report only when it is given', () => {
    const base = {
      repository: 'https://example.test/r',
      title: 't',
      what: 'w',
      version: '1',
      system: 'macOS',
      where: 'Modeling',
      log: '',
      picture: false,
    };
    expect(reportBody(base)).not.toContain('What was done');
    expect(reportBody({ ...base, activity: ['000:01 click Extrude'] })).toContain(
      '000:01 click Extrude',
    );
  });
});
