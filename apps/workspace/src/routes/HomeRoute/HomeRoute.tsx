import { Col } from '@jsxstyle/react'
import { Card } from '@repro/design'
import React, { Fragment } from 'react'
import { useDetectExtension } from '~/hooks/useDetectExtension'

export const HomeRoute: React.FC = () => {
  //function goToChromeWebStore() {
  //  window.location.href =
  //    'https://chrome.google.com/webstore/detail/repro/ecmbphfjfhnifmhbjhpejbpdnpanpice'
  //}

  const hasExtension = useDetectExtension()

  return (
    <Fragment>
      {!hasExtension && (
        <Card padding={0}>
          <Col gap={10} padding={20}></Col>
        </Card>
      )}
    </Fragment>
  )
}
