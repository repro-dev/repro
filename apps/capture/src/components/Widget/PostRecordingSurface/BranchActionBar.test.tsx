// eslint-disable-next-line @typescript-eslint/no-require-imports
const { describe, it, mock } = require('node:test')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const assert = require('node:assert/strict')

// Mock auth deps
mock.module('@repro/auth', {
  namedExports: {
    useSession: () => ({ user: { id: 'user-1' }, email: 'test@test.com' }),
    useSessionLoading: () => false,
    useAuthContext: () => ({ loadSession: () => ({ pipe: () => ({}) }) }),
  },
})

// eslint-disable-next-line @typescript-eslint/no-require-imports
const React = require('react')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { render, screen } = require('@testing-library/react')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { BranchActionBar } = require('./BranchActionBar')

describe('BranchActionBar', () => {
  it('renders action buttons', () => {
    render(
      React.createElement(BranchActionBar, {
        onUploadToWorkspace: () => undefined,
        onDownloadLocally: () => undefined,
        onToggleManualUpload: () => undefined,
        isManualUploadExpanded: false,
        hasProjectId: true,
      })
    )

    // Check for action buttons by text content
    const uploadBtn = screen.queryByText('Upload to Workspace')
    assert.ok(uploadBtn, 'Upload to Workspace button should be rendered')

    const downloadBtn = screen.queryByText('Download Locally')
    assert.ok(downloadBtn, 'Download Locally button should be rendered')

    const manualUploadBtn = screen.queryByText('Manual Upload')
    assert.ok(manualUploadBtn, 'Manual Upload button should be rendered')
  })
})
