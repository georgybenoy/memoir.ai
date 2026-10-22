import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SafeMarkdown } from '@/components/tutor/SafeMarkdown';

describe('SafeMarkdown Component (safe-markdown.test.tsx)', () => {
  it('renders standard Markdown headings, lists, and code blocks', () => {
    const md = `
# Concept Overview
This is a **key principle** of cell biology.

- Mitochondria
- Thylakoids

\`const energy = "ATP";\`
`;
    render(<SafeMarkdown content={md} />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Concept Overview');
    expect(screen.getByText('key principle')).toBeInTheDocument();
    expect(screen.getByText('Mitochondria')).toBeInTheDocument();
    expect(screen.getByText('Thylakoids')).toBeInTheDocument();
    expect(screen.getByText('const energy = "ATP";')).toBeInTheDocument();
  });

  it('renders raw script tags inertly without executing or injecting script elements', () => {
    (window as unknown as { pwned?: boolean }).pwned = false;

    const maliciousContent = `
Dangerous explanation:
<script>window.pwned = true;</script>
Normal text continues.
`;
    const { container } = render(<SafeMarkdown content={maliciousContent} />);

    // Must NOT contain an actual HTML script tag
    const scriptElements = container.querySelectorAll('script');
    expect(scriptElements.length).toBe(0);

    // Script did not execute
    expect((window as unknown as { pwned?: boolean }).pwned).toBe(false);

    // Normal text is rendered
    expect(screen.getByText(/Dangerous explanation/)).toBeInTheDocument();
  });

  it('renders raw image onerror tags inertly without injecting executable DOM handlers', () => {
    (window as unknown as { pwnedImg?: boolean }).pwnedImg = false;

    const maliciousImg = `
Malicious image payload:
<img src="invalid-url.jpg" onerror="window.pwnedImg = true;" />
Still safe.
`;
    const { container } = render(<SafeMarkdown content={maliciousImg} />);

    // Must NOT contain an HTML img element with onerror attribute
    const imgElements = container.querySelectorAll('img');
    for (const img of Array.from(imgElements)) {
      expect(img.getAttribute('onerror')).toBeNull();
    }
    expect((window as unknown as { pwnedImg?: boolean }).pwnedImg).toBe(false);
  });

  it('neutralizes dangerous javascript: URI pseudo-protocols in links', () => {
    const maliciousLink = `[Click for free points](javascript:alert("hacked"))`;
    const { container } = render(<SafeMarkdown content={maliciousLink} />);

    const link = container.querySelector('a');
    expect(link).toBeInTheDocument();
    expect(link?.getAttribute('href')).not.toBe('javascript:alert("hacked")');
    expect(link?.getAttribute('href')).toBe('#');
  });

  it('allows safe HTTPS external links', () => {
    const safeLink = `[Reference Docs](https://example.com/notes)`;
    const { container } = render(<SafeMarkdown content={safeLink} />);

    const link = container.querySelector('a');
    expect(link).toBeInTheDocument();
    expect(link?.getAttribute('href')).toBe('https://example.com/notes');
    expect(link?.getAttribute('target')).toBe('_blank');
    expect(link?.getAttribute('rel')).toBe('noopener noreferrer');
  });
});
