import { Block, Col, InlineRow, Row } from '@jsxstyle/react'
import { formatDate, formatTime } from '@repro/date-utils'
import { color, transition } from '@repro/design'
import { RecordingInfo, RecordingMode } from '@repro/domain'
import { Camera as CameraIcon, Video as VideoIcon } from 'lucide-react'
import React from 'react'
import { Link } from 'react-router-dom'

interface Props {
  recording: RecordingInfo
  projectId: string
}

export const RecordingTile: React.FC = ({ recording, projectId }) => {
  const href = `/projects/${projectId}/recordings/${recording.id}`

  return (
    // Render the entire tile as a single <a> via Link so that browser-native
    // modifier-click semantics (Ctrl+click, Cmd+click, middle-click) open the
    // recording in a new tab.  A parent onClick + inner Link would fight each
    // other: the outer handler fires unconditionally and bypasses the browser's
    // native handling.
    <Col
      component={Link}
      padding={15}
      gap={10}
      fontSize={13}
      color={color.text.default}
      backgroundColor={color.bg.hover}
      borderColor="transparent"
      borderWidth={1}
      borderStyle="solid"
      borderRadius={4}
      cursor="pointer"
      textDecoration="none"
      hoverBackgroundColor={color.bg.surface}
      hoverBorderColor={color.border.focus}
      hoverColor={color.primary}
      hoverBoxShadow={`0 4px 8px ${color.border.default}`}
      transition={transition.fast}
      props={{ to: href }}
    >
      <Row alignItems="center" gap={10}>
        <InlineRow
          alignItems="center"
          gap={10}
          height={24}
          paddingH={8}
          backgroundColor={color.primarySubtle}
          color={color.primary}
          borderRadius={4}
        >
          {(recording.mode === RecordingMode.Live ||
            recording.mode === RecordingMode.Replay) && <VideoIcon size={16} />}

          {recording.mode === RecordingMode.Snapshot && (
            <CameraIcon size={16} />
          )}
        </InlineRow>

        <Block fontSize={16} lineHeight={1.5}>
          {recording.title}
        </Block>
      </Row>

      <Row alignItems="center" gap={10} fontSize={13} lineHeight={1.5}>
        {(recording.mode === RecordingMode.Live ||
          recording.mode === RecordingMode.Replay) &&
          formatTime(recording.duration, 'seconds')}

        <Block color={color.text.secondary}>
          {formatDate(recording.createdAt)}
        </Block>
      </Row>
    </Col>
  )
}
