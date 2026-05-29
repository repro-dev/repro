import { render, screen } from '@testing-library/react'
import assert from 'node:assert/strict'
import { before, describe, it, mock } from 'node:test'
import React from 'react'

import type { BranchActionBarProps } from './BranchActionBar'

mock.module('@repro/auth', {
  namedExports: {
    useSession: () => ({ user: { id: 'user-1' }, email: 'test@test.com' }),
    useSessionLoading: () => false,
    useAuthContext: () => ({ loadSession: () => ({ pipe: () => ({}) }) }),
  },
})

let BranchActionBar: React.FC<BranchActionBarProps>

before(async () => {
  const mod = await import('./BranchActionBar')
  BranchActionBar = mod.BranchActionBar
})

describe('BranchActionBar', () => {
  it('renders action buttons', () => {
    render(
      <BranchActionBar
        onUploadToWorkspace={() => undefined}
        onDownloadLocally={() => undefined}
        onToggleManualUpload={() => undefined}
        isManualUploadExpanded={false}
        hasProjectId={true}
      />
    )

    const uploadBtn = screen.queryByText('Upload to Workspace')
    assert.ok(uploadBtn, 'Upload to Workspace button should be rendered')

    const downloadBtn = screen.queryByText('Download Locally')
    assert.ok(downloadBtn, 'Download Locally button should be rendered')

    const manualUploadBtn = screen.queryByText('Manual Upload')
    assert.ok(manualUploadBtn, 'Manual Upload button should be rendered')
  })
})
