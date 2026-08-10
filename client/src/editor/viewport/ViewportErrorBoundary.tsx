import { Component, type ErrorInfo, type ReactNode } from 'react'
import styles from './ViewportErrorBoundary.module.css'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * 뷰포트가 죽었을 때 빈 화면 대신 이유를 보여준다.
 *
 * 0단계에서 drei 컴포넌트 하나가 `gl.capabilities` 를 읽어 앱 전체가 죽은 적이 있는데,
 * 화면에는 아무것도 없고 콘솔을 열어야만 원인을 알 수 있었다. **3D 도구에서 검은 화면은
 * 로딩 중과 구분되지 않으므로** 실패는 화면에서 말해야 한다.
 *
 * 렌더 단계의 예외만 잡는다. `useFrame` 안이나 렌더러 초기화 같은 비동기 경로의 실패는
 * 여기 걸리지 않으며, 그쪽은 상태 바의 렌더러 보고가 담당한다.
 */
export class ViewportErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[viewport] 렌더 중 예외가 발생했습니다', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className={styles.panel} role="alert">
        <p className={styles.title}>뷰포트를 그리지 못했습니다</p>
        <pre className={styles.message}>{error.message}</pre>
        <p className={styles.hint}>
          자세한 내용은 브라우저 콘솔에 있습니다. WebGPU에서 동작하지 않는 컴포넌트가 원인일 수
          있습니다 — <code>client/src/editor/viewport/README.md</code> 의 호환 표를 확인하십시오.
        </p>
        {/*
          에러 경계는 한 번 걸리면 스스로 풀리지 않는다. **되돌리기로 원인을 없애도 화면은
          그대로 죽어 있으므로** 다시 그려볼 길을 남긴다. 원인이 남아 있으면 곧바로 다시
          이 화면이 뜬다 — 그것도 정보다.
        */}
        <button type="button" onClick={() => this.setState({ error: null })}>
          다시 그리기
        </button>
      </div>
    )
  }
}
