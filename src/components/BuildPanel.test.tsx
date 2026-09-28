import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { emptyBuild } from '@/data';

import { BuildPanel } from './BuildPanel';

function Harness() {
  const [build, setBuild] = useState(() => emptyBuild());
  return <BuildPanel build={build} onChange={setBuild} />;
}

describe('buildPanel', () => {
  it('adds a part, shows its whole spec, edits a field, and removes it', () => {
    render(<Harness />);

    // Every slot starts absent with an Add control; the CPU is first.
    fireEvent.click(screen.getAllByRole('button', { name: 'Add' })[0]);

    // The CPU editor shows its fields at once, not one at a time.
    const clock = screen.getByLabelText('Clock');
    const cores = screen.getByLabelText('Cores');
    expect(clock).toBeInTheDocument();
    expect(cores).toBeInTheDocument();

    // Editing one field writes through the data layer.
    fireEvent.change(clock, { target: { value: '5000000000' } });
    expect(screen.getByLabelText<HTMLInputElement>('Clock').value).toBe('5000000000');

    // Removing the part returns the slot to absent.
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0]);
    expect(screen.queryByLabelText('Clock')).not.toBeInTheDocument();
  });

  it('restores the value and names the invariant when a change is refused', () => {
    render(<Harness />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Add' })[0]);

    // 1 KiB of L3 cannot hold 32 ways of 64-byte lines, so widening is refused.
    fireEvent.change(screen.getByLabelText('L3 capacity'), { target: { value: '1024' } });
    fireEvent.change(screen.getByLabelText('L3 ways'), { target: { value: '32' } });

    expect(screen.getByText(/^Refused:/)).toBeInTheDocument();
    expect(screen.getByLabelText<HTMLInputElement>('L3 ways').value).toBe('16');
  });
});
