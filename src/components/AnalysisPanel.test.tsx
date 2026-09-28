import type { Build } from '@/data';

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { applyParameter, completeBuild } from '@/data';
import { buildSheet } from '@/sheet';
import { simulate } from '@/sim';
import { testBuild } from '@/testing/build';
import { generateAccesses, streamingSpec } from '@/workloads';

import { AnalysisPanel } from './AnalysisPanel';

function sheetOf(build: Build) {
  const config = completeBuild(build);
  const result = config === null
    ? null
    : simulate(config, generateAccesses(streamingSpec({ accessCount: 2000 })));
  return buildSheet({ build, origin: {}, result, workload: 'streaming' });
}

describe('analysisPanel', () => {
  it('summarises a compatible build and lists its checks', () => {
    render(<AnalysisPanel sheet={sheetOf(testBuild())} workload="streaming" onWorkloadChange={() => {}} />);

    expect(screen.getByText('Compatible')).toBeInTheDocument();
    expect(screen.getByText(/fits the board/)).toBeInTheDocument();
  });

  it('flags an incompatible socket in the summary and the checks', () => {
    const mismatched = applyParameter(testBuild(), 'cpu', 'socket', 'am5').build;
    render(<AnalysisPanel sheet={sheetOf(mismatched)} workload="streaming" onWorkloadChange={() => {}} />);

    expect(screen.getByText(/Not compatible/)).toBeInTheDocument();
    expect(screen.getByText(/does not fit/)).toBeInTheDocument();
  });
});
