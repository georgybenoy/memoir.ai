import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Dialog, DialogTrigger, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

describe('Dialog Component', () => {
  it('renders trigger button and remains closed initially', () => {
    render(
      <Dialog>
        <DialogTrigger asChild>
          <Button>Open Modal</Button>
        </DialogTrigger>
        <DialogContent title="Test Title" description="Test Description">
          <div>Modal Body Content</div>
        </DialogContent>
      </Dialog>,
    );

    expect(screen.getByRole('button', { name: /open modal/i })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens dialog when trigger is clicked and displays accessible name', async () => {
    const user = userEvent.setup();

    render(
      <Dialog>
        <DialogTrigger asChild>
          <Button>Open Modal</Button>
        </DialogTrigger>
        <DialogContent title="Confirm Deletion" description="Are you sure you want to proceed?">
          <div>Modal Body Content</div>
        </DialogContent>
      </Dialog>,
    );

    await user.click(screen.getByRole('button', { name: /open modal/i }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText('Confirm Deletion')).toBeInTheDocument();
    expect(screen.getByText('Are you sure you want to proceed?')).toBeInTheDocument();
  });

  it('closes when close button is clicked', async () => {
    const user = userEvent.setup();

    render(
      <Dialog>
        <DialogTrigger asChild>
          <Button>Open Modal</Button>
        </DialogTrigger>
        <DialogContent title="Test Title" description="Test Description">
          <div>Modal Body</div>
        </DialogContent>
      </Dialog>,
    );

    await user.click(screen.getByRole('button', { name: /open modal/i }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();

    const closeBtn = screen.getByRole('button', { name: /close dialog/i });
    await user.click(closeBtn);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes on Escape key press', async () => {
    const user = userEvent.setup();

    render(
      <Dialog>
        <DialogTrigger asChild>
          <Button>Open Modal</Button>
        </DialogTrigger>
        <DialogContent title="Escape Test" description="Close with escape">
          <div>Content</div>
        </DialogContent>
      </Dialog>,
    );

    await user.click(screen.getByRole('button', { name: /open modal/i }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
