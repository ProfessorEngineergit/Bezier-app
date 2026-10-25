import { describe, expect, it } from 'vitest';
import { forgetLog, installLogBuffer, readLog, sayToLog } from './log-buffer.js';
import { reportBody, reportUrl } from './report-body.js';

const base = {
  repository: 'https://github.com/example/bezier',
  title: 'The extrude field',
  what: 'It stays empty.',
  version: '0.1.0',
  system: 'macOS',
  where: 'Modeling',
  log: '',
  picture: false,
};

describe('report body', () => {
  it('says what happened and where, with the version and system under it', () => {
    const body = reportBody(base);
    expect(body).toContain('It stays empty.');
    expect(body).toContain('Bezier 0.1.0 · macOS · Modeling');
  });

  it('carries what is known of the machine in a folded block, and nothing when there is none', () => {
    expect(reportBody(base)).not.toContain('This machine');
    const body = reportBody({ ...base, diagnostics: ['System: Windows 10.0', 'Cores: 8'] });
    expect(body).toContain('<summary>This machine</summary>');
    expect(body).toContain('- System: Windows 10.0');
  });

  it('carries the log in a folded block, and says a picture was copied', () => {
    const body = reportBody({ ...base, log: '10:00:01 error boom', picture: true });
    expect(body).toContain('<details><summary>Log</summary>');
    expect(body).toContain('10:00:01 error boom');
    expect(body).toContain('paste it here');
  });

  it('files each kind under its own label and names it in the body', () => {
    const url = reportUrl({ ...base, kind: 'idea' });
    expect(decodeURIComponent(url)).toContain('labels=report,enhancement');
    expect(reportBody({ ...base, kind: 'idea' })).toContain('Idea · Bezier 0.1.0');
    expect(decodeURIComponent(reportUrl({ ...base, kind: 'problem' }))).toContain(
      'labels=report,bug',
    );
  });

  it('shortens the log until the address fits', () => {
    const log = Array.from(
      { length: 300 },
      (_, i) => `10:00:${String(i % 60).padStart(2, '0')} error ${'x'.repeat(200)} ${i}`,
    ).join('\n');
    const url = reportUrl({ ...base, log });
    expect(url.length).toBeLessThanOrEqual(6000);
    expect(url.startsWith('https://github.com/example/bezier/issues/new?')).toBe(true);
    // The newest lines are what is kept.
    expect(decodeURIComponent(url.replace(/\+/g, ' '))).toContain(' 299');
  });
});

describe('log buffer', () => {
  it('keeps what was said, cut short, newest last', () => {
    forgetLog();
    installLogBuffer();
    sayToLog('error', new Error('first'));
    sayToLog('warn', 'x'.repeat(1000));
    const lines = readLog().split('\n');
    expect(lines[0]).toContain('error Error: first');
    expect((lines[1] ?? '').length).toBeLessThan(450);
  });

  it('forgets the oldest past its limit', () => {
    forgetLog();
    for (let i = 0; i < 120; i++) sayToLog('warn', `line ${i}`);
    const lines = readLog().split('\n');
    expect(lines).toHaveLength(80);
    expect(lines[0]).toContain('line 40');
  });
});
