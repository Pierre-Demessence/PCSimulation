import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { emptyBuild } from '@/data';

import { BuildPanel } from './BuildPanel';

function Harness() {
  const [build, setBuild] = useState(() => emptyBuild());
  return <BuildPanel build={build} statuses={{}} onChange={setBuild} />;
}

describe('buildPanel', () => {
  it('adds a part and edits its whole spec in the Edit dialog', () => {
    render(<Harness />);

    // Every slot starts absent with an Add control; the CPU is first.
    fireEvent.click(screen.getAllByRole('button', { name: 'Add' })[0]);

    // The row is compact until Edit opens the full-spec dialog.
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    const clock = screen.getByLabelText('Clock');
    expect(clock).toBeInTheDocument();
    expect(screen.getByLabelText('Cores')).toBeInTheDocument();

    fireEvent.change(clock, { target: { value: '5000000000' } });
    expect(screen.getByLabelText<HTMLInputElement>('Clock').value).toBe('5000000000');
  });

  it('removes a part', () => {
    render(<Harness />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Add' })[0]);
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
  });

  it('restores the value and names the invariant when a change is refused', () => {
    render(<Harness />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Add' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

    // 1 KiB of L3 cannot hold 32 ways of 64-byte lines, so widening is refused.
    fireEvent.change(screen.getByLabelText('L3 capacity'), { target: { value: '1024' } });
    fireEvent.change(screen.getByLabelText('L3 ways'), { target: { value: '32' } });

    expect(screen.getByText(/^Refused:/)).toBeInTheDocument();
    expect(screen.getByLabelText<HTMLInputElement>('L3 ways').value).toBe('16');
  });
});
