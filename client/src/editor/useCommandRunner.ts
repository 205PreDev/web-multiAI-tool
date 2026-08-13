import { describeCommand, type Command } from './commands'
import { useEditorStore, type ExecuteResult } from './scene/store'
import { toast } from '../ui/toast'

/**
 * 커맨드를 실행하고 결과를 사용자에게 말한다.
 *
 * **`execute` 를 대신하지 않는다.** 씬을 바꾸는 경로는 여전히 `useEditorStore.execute` 하나이고,
 * 이것은 그 위에 `docs/UX.md` 4절의 토스트를 얹는 얇은 겹이다.
 *
 * UI 가 `execute` 를 직접 부르지 않고 이쪽을 부르는 이유는 **`ExecuteResult.reason` 을 아무도
 * 읽지 않으면 실패가 조용해지기 때문이다.** 노드를 자기 자손 위에 떨어뜨리는 것은 사용자의
 * 정상 조작이고(UX 3.7절), 그때 화면에서 아무 일도 일어나지 않으면 도구가 고장 난 것으로 읽힌다.
 *
 * **훅이 아닌 함수로 두는 것이 핵심이다.** 소비자가 컴포넌트만이 아니다 — 단축키 핸들러가
 * 이미 훅 밖에 있고, 조수(F-3)와 협업 수신(K-4)도 그렇다. UX 4절은 "조수가 실행한 커맨드도
 * 같은 토스트를 쓴다"고 정했는데, 이것이 훅이면 그 셋이 각자 토스트를 다시 짜게 된다.
 */
export function runCommand(command: Command): ExecuteResult {
  const result = useEditorStore.getState().execute(command)

  if (result.ok) toast(`${describeCommand(command)} · Ctrl+Z로 되돌리기`)
  else toast(result.reason, 'danger')

  return result
}

/** 컴포넌트에서 쓰는 이름. 하는 일은 `runCommand` 와 같다 */
export function useCommandRunner(): (command: Command) => ExecuteResult {
  return runCommand
}
