import { describe, expect, it, vi } from 'vitest';
import { emitDiagnostic } from '../../src/diagnostics/safe-log.js';

describe('safe diagnostics', () => {
  it('emits a lazily formatted diagnostic', () => {
    const log = vi.fn();
    expect(emitDiagnostic(log, () => 'diagnostic message')).toBe(true);
    expect(log).toHaveBeenCalledWith('diagnostic message');
  });

  it('does not let diagnostic formatting or logging interrupt the caller', () => {
    expect(emitDiagnostic(() => {}, () => { throw new Error('format failed'); })).toBe(false);
    expect(emitDiagnostic(() => { throw new Error('log failed'); }, () => 'message')).toBe(false);
  });

  it('skips an empty optional diagnostic', () => {
    const log = vi.fn();
    expect(emitDiagnostic(log, () => null)).toBe(false);
    expect(log).not.toHaveBeenCalled();
  });
});
