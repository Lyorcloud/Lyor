import '@testing-library/jest-dom/vitest';

import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

HTMLMediaElement.prototype.load = vi.fn();
HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);

afterEach(() => { cleanup(); vi.useRealTimers(); });
