// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppRouter } from './router';

const navigate = vi.fn();
let location = { pathname: '/dashboard', searchStr: '', hash: 'home' };

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate,
  useLocation: () => location,
  useSearch: () => ({}),
}));

describe('useAppRouter', () => {
  beforeEach(() => {
    navigate.mockReset();
    location = { pathname: '/dashboard', searchStr: '', hash: 'home' };
  });

  it('keeps navigation methods stable when only route location changes', () => {
    const { result, rerender } = renderHook(() => useAppRouter());
    const push = result.current.push;
    const replace = result.current.replace;

    act(() => {
      location = { ...location, hash: 'calendar' };
      rerender();
    });

    expect(result.current.push).toBe(push);
    expect(result.current.replace).toBe(replace);
    expect(result.current.asPath).toBe('/dashboard#calendar');
  });
});
