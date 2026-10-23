import { describe, expect, it } from 'vitest';
import { parseRenderModeParam, resolveRenderMode } from './mode';

describe('render mode resolution', () => {
  it('only accepts the documented URL values', () => {
    expect(parseRenderModeParam('dom')).toBe('dom');
    expect(parseRenderModeParam('canvas')).toBe('canvas');
    expect(parseRenderModeParam('auto')).toBe('auto');
    expect(parseRenderModeParam(null)).toBe('auto');
    expect(parseRenderModeParam('CANVAS')).toBe('auto');
    expect(parseRenderModeParam('webgl')).toBe('auto');
  });

  it('uses canvas for auto when the API is present', () => {
    expect(resolveRenderMode('auto', { canvas: true })).toEqual({
      requested: 'auto',
      mode: 'canvas',
      forcedFallback: false,
    });
  });

  it('falls back to DOM quietly for auto when the API is absent', () => {
    expect(resolveRenderMode('auto', { canvas: false })).toEqual({
      requested: 'auto',
      mode: 'dom',
      forcedFallback: false,
    });
  });

  it('honours an explicit DOM request even when canvas is available', () => {
    expect(resolveRenderMode('dom', { canvas: true })).toEqual({
      requested: 'dom',
      mode: 'dom',
      forcedFallback: false,
    });
  });

  it('falls back and reports the forced fallback for an unsupported canvas request', () => {
    expect(resolveRenderMode('canvas', { canvas: false })).toEqual({
      requested: 'canvas',
      mode: 'dom',
      forcedFallback: true,
    });
  });

  it('honours a supported canvas request', () => {
    expect(resolveRenderMode('canvas', { canvas: true })).toEqual({
      requested: 'canvas',
      mode: 'canvas',
      forcedFallback: false,
    });
  });
});
