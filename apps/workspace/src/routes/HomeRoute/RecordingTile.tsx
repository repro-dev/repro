import { Block, Col, InlineRow, Row } from '@jsxstyle/react'
import { formatDate, formatTime } from '@repro/date-utils'
import { colors } from '@repro/design'
import { RecordingInfo, RecordingMode } from '@repro/domain'
import { Camera as CameraIcon, Video as VideoIcon } from 'lucide-react'
import React from 'react'
import { Link } from 'react-router-dom'

interface Props {
  recording: RecordingInfo
  projectId: string
}

export const RecordingTile: React.FC<Props> = ({ recording, projectId }) => {
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
      color={colors.slate['800']}
      backgroundColor={colors.slate['100']}
      borderColor="transparent"
      borderWidth={1}
      borderStyle="solid"
      borderRadius={4}
      cursor="pointer"
      textDecoration="none"
      hoverBackgroundColor={colors.white}
      hoverBorderColor={colors.blue['500']}
      hoverColor={colors.blue['700']}
      hoverBoxShadow={`0 4px 8px ${colors.slate['200']}`}
      transition="all linear 100ms"
      props={{ to: href }}
    >
      <Row alignItems="center" gap={10}>
        <InlineRow
          alignItems="center"
          gap={10}
          height={24}
          paddingH={8}
          backgroundColor={colors.blue['100']}
          color={colors.blue['700']}
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

        <Block color={colors.slate['700']}>
          {formatDate(recording.createdAt)}
        </Block>
      </Row>
    </Col>
  )
}
