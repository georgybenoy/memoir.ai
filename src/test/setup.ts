import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// Mock server-only so Vitest tests can import server-side gateways and handlers
vi.mock('server-only', () => ({}));
