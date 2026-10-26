import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WorkflowStepper } from '@/components/workflow/stepper';

describe('WorkflowStepper Component (Phase R3)', () => {
  it('renders all four steps with short titles and step numbers', () => {
    render(<WorkflowStepper currentStep={1} />);

    expect(screen.getByText('Add Material')).toBeInTheDocument();
    expect(screen.getByText('Organise Units')).toBeInTheDocument();
    expect(screen.getByText('Choose Mode')).toBeInTheDocument();
    expect(screen.getByText('Study Session')).toBeInTheDocument();
  });

  it('marks current step with aria-current="step" and active label', () => {
    render(<WorkflowStepper currentStep={2} materialId="mat-123" />);

    // Step 2 should have aria-current="step"
    const activeStepContainer = screen.getByText('Organise Units').closest('[aria-current="step"]');
    expect(activeStepContainer).toBeInTheDocument();
    expect(screen.getByText(/Step 2 \(Active\)/i)).toBeInTheDocument();
  });

  it('renders completed steps with checkmark and accessible clickable link when materialId is provided', async () => {
    const handleStepClick = vi.fn();
    const user = userEvent.setup();

    render(
      <WorkflowStepper
        currentStep={3}
        materialId="mat-456"
        highestCompletedStep={2}
        onStepClick={handleStepClick}
      />
    );

    // Step 1 and Step 2 should be completed and linkable
    const step1Link = screen.getByRole('link', { name: /Step 1: Add Material \(Completed, click to revisit\)/i });
    expect(step1Link).toBeInTheDocument();
    expect(step1Link).toHaveAttribute('href', '/learn/new');

    const step2Link = screen.getByRole('link', { name: /Step 2: Organise Units \(Completed, click to revisit\)/i });
    expect(step2Link).toBeInTheDocument();
    expect(step2Link).toHaveAttribute('href', '/learn/mat-456/organise');

    await user.click(step1Link);
    expect(handleStepClick).toHaveBeenCalledWith(1);
  });

  it('marks upcoming steps as disabled / non-clickable with upcoming indicator', () => {
    render(<WorkflowStepper currentStep={2} materialId="mat-789" />);

    // Step 4 is upcoming
    expect(screen.getByText(/Step 4 \(Upcoming\)/i)).toBeInTheDocument();
    // Step 4 should not be a link
    expect(screen.queryByRole('link', { name: /Step 4/i })).not.toBeInTheDocument();
  });

  it('indicates completed vs active vs upcoming by icon and label, satisfying WCAG 2.2 AA non-color reliance', () => {
    const { container } = render(<WorkflowStepper currentStep={2} materialId="mat-789" />);

    // SVG icons are rendered for each step with distinct styling
    const svgs = container.querySelectorAll('ol svg');
    expect(svgs.length).toBeGreaterThanOrEqual(4);

    // Completed step 1 has accent-green icon and Completed text
    const completedIcon = container.querySelector('svg.text-\\[var\\(--accent-green\\)\\]');
    expect(completedIcon).toBeInTheDocument();
    expect(screen.getByLabelText(/Step 1: Add Material \(Completed, click to revisit\)/i)).toBeInTheDocument();

    // Active step 2 has pulse icon and Active label
    const activeIcon = container.querySelector('svg.animate-pulse');
    expect(activeIcon).toBeInTheDocument();
    expect(screen.getByText(/Step 2 \(Active\)/i)).toBeInTheDocument();

    // Upcoming steps 3 and 4 have Upcoming labels
    expect(screen.getByText(/Step 3 \(Upcoming\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Step 4 \(Upcoming\)/i)).toBeInTheDocument();
  });
});
