import * as React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PomodoroCapsule } from '@/components/pomodoro/PomodoroCapsule';
import { _setNow, _resetNow } from '@/lib/utils/clock';

describe('PomodoroCapsule Component — Unit & Component Tests', () => {
  let mockTime = 1700000000000;

  beforeEach(() => {
    mockTime = 1700000000000;
    _setNow(() => new Date(mockTime));
    if (typeof window !== 'undefined') {
      window.localStorage.clear();
    }
  });

  afterEach(() => {
    _resetNow();
    if (typeof window !== 'undefined') {
      window.localStorage.clear();
    }
  });

  it('renders capsule with initial idle focus state and tabular digits', () => {
    render(<PomodoroCapsule />);

    const button = screen.getByRole('button', { name: /Pomodoro timer, Focus/i });
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute('aria-haspopup', 'dialog');
    expect(button).toHaveAttribute('aria-expanded', 'false');

    expect(screen.getByText('Focus')).toBeInTheDocument();
    expect(screen.getByText('25:00')).toBeInTheDocument();
  });

  it('toggles popover dialog on click and provides large timer display and controls', async () => {
    const user = userEvent.setup();
    render(<PomodoroCapsule />);

    const button = screen.getByRole('button', { name: /Pomodoro timer, Focus/i });
    await user.click(button);

    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('dialog', { name: /Pomodoro timer controls/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Start focus timer/i })).toBeInTheDocument();
    expect(screen.getByText(/Time is tracked by your device clock/i)).toBeInTheDocument();
  });

  it('closes popover on Escape key and returns focus to capsule button', async () => {
    const user = userEvent.setup();
    render(<PomodoroCapsule />);

    const button = screen.getByRole('button', { name: /Pomodoro timer, Focus/i });
    await user.click(button);

    expect(screen.getByRole('dialog', { name: /Pomodoro timer controls/i })).toBeInTheDocument();

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog', { name: /Pomodoro timer controls/i })).not.toBeInTheDocument();
    expect(button).toHaveFocus();
  });

  it('starts timer when clicking Start Focus, changes button to Pause', async () => {
    const user = userEvent.setup();
    render(<PomodoroCapsule />);

    const trigger = screen.getByRole('button', { name: /Pomodoro timer, Focus/i });
    await user.click(trigger);

    const startBtn = screen.getByRole('button', { name: /Start focus timer/i });
    await user.click(startBtn);

    expect(screen.getByRole('button', { name: /Pause timer/i })).toBeInTheDocument();
  });

  it('validates custom duration input and shows error message for out-of-range values', async () => {
    const user = userEvent.setup();
    render(<PomodoroCapsule />);

    const trigger = screen.getByRole('button', { name: /Pomodoro timer, Focus/i });
    await user.click(trigger);

    const input = screen.getByLabelText(/Custom focus duration in minutes/i);
    await user.type(input, '150');

    const setBtn = screen.getByRole('button', { name: 'Set' });
    await user.click(setBtn);

    expect(
      screen.getByText(/Please enter a duration between 1 and 120 minutes/i),
    ).toBeInTheDocument();
  });

  it('requests notification permission only when user flips the notification toggle', async () => {
    const requestPermissionMock = vi.fn().mockResolvedValue('granted');
    vi.stubGlobal('Notification', {
      permission: 'default',
      requestPermission: requestPermissionMock,
    });

    const user = userEvent.setup();
    render(<PomodoroCapsule />);

    const trigger = screen.getByRole('button', { name: /Pomodoro timer, Focus/i });
    await user.click(trigger);

    expect(requestPermissionMock).not.toHaveBeenCalled();

    const notifToggle = screen.getByLabelText(/Browser notification/i);
    await user.click(notifToggle);

    expect(requestPermissionMock).toHaveBeenCalledTimes(1);

    vi.unstubAllGlobals();
  });

  it('does NOT announce ticking seconds via aria-live, only announces state changes', async () => {
    render(<PomodoroCapsule />);

    const politeRegion = screen.getByRole('status');
    expect(politeRegion).toBeInTheDocument();
    // At idle on mount, ticking seconds are never in the live region
    expect(politeRegion.textContent).not.toMatch(/\d{2}:\d{2}/);
  });
});
