import type { ComponentProps } from 'react';
import type { Feather } from '@expo/vector-icons';

export type SubmitIntent =
  | 'createProject'
  | 'submitTransaction'
  | 'createTask'
  | 'updateTask'
  | 'saveDpr'
  | 'submitMaterialRequest'
  | 'generic';

export type FeatherIconName = ComponentProps<typeof Feather>['name'];

export type SubmitProgressDescriptor = {
  title: string;
  creativeLines: readonly string[];
  icons: readonly FeatherIconName[];
  loaderKind:
    | 'isometricRoom'
    | 'draftingTrace'
    | 'scaleTicks'
    | 'modularJoint'
    | 'materialStack'
    | 'laserCross'
    | 'plumbBob'
    | 'frameAssembler'
    | 'blueprint';
};

const CATALOG: Record<SubmitIntent, SubmitProgressDescriptor> = {
  createProject: {
    title: 'Creating your project',
    creativeLines: [
      'Laying out rooms and goals...',
      'Drafting a clean project shell...',
      'Setting up a smooth start line...',
    ],
    icons: ['layout', 'home', 'grid'],
    loaderKind: 'isometricRoom',
  },
  submitTransaction: {
    title: 'Submitting transaction',
    creativeLines: [
      'Balancing numbers and notes...',
      'Sealing bill details for review...',
      'Routing this entry to the ledger...',
    ],
    icons: ['pen-tool', 'box', 'move'],
    loaderKind: 'draftingTrace',
  },
  createTask: {
    title: 'Creating timeline item',
    creativeLines: [
      'Pinning this task to your schedule...',
      'Connecting task ownership and dates...',
      'Locking progress checkpoints...',
    ],
    icons: ['mouse-pointer', 'crosshair', 'layers'],
    loaderKind: 'modularJoint',
  },
  updateTask: {
    title: 'Updating task',
    creativeLines: [
      'Syncing latest progress updates...',
      'Refreshing assignee and status...',
      'Keeping the crew aligned...',
    ],
    icons: ['mouse-pointer', 'crosshair', 'layers'],
    loaderKind: 'frameAssembler',
  },
  saveDpr: {
    title: 'Saving daily progress',
    creativeLines: [
      'Aligning today work notes...',
      'Measuring progress and blockers...',
      'Packing your DPR with care...',
    ],
    icons: ['compass', 'maximize', 'map'],
    loaderKind: 'laserCross',
  },
  submitMaterialRequest: {
    title: 'Submitting material request',
    creativeLines: [
      'Stacking quantities and rates...',
      'Routing this list to approvers...',
      'Preparing site-ready material flow...',
    ],
    icons: ['box', 'layers', 'pen-tool'],
    loaderKind: 'materialStack',
  },
  generic: {
    title: 'Saving changes',
    creativeLines: [
      'Polishing details in the background...',
      'Applying updates safely...',
      'Almost there...',
    ],
    icons: ['square', 'maximize', 'grid'],
    loaderKind: 'blueprint',
  },
};

export function submitProgressFor(intent: SubmitIntent): SubmitProgressDescriptor {
  return CATALOG[intent] ?? CATALOG.generic;
}
