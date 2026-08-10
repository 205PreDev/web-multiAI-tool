# client/src/editor/viewport

R3F 뷰포트와 렌더러 선택.

## 반드시 알아야 할 것 — WebGPU 는 raw ShaderMaterial 을 못 쓴다

**`WebGPURenderer` 는 NodeMaterial 위에 서 있어 `ShaderMaterial` / `RawShaderMaterial` 을 컴파일하지 못합니다.** 그때 나오는 경고는 이것뿐입니다.

```
THREE.NodeBuilder: Material "ShaderMaterial" is not compatible.
```

**이 경고는 범인을 말해주지 않고, 해당 오브젝트는 오류 없이 화면에서 사라집니다.** 0단계에서 drei 의 `Grid` 가 정확히 이 방식으로 사라졌고, 그리드가 없다는 사실 자체를 한참 뒤에 알았습니다.

### 그래서 두 가지를 둡니다

1. **`warnIncompatibleMaterials.ts`** — 개발 빌드에서 씬을 훑어 범인의 이름과 경로를 찍습니다. `SceneDiagnostics` 가 씬 트리 끝에서 한 번 호출합니다.
2. **이 문서** — 아래 목록을 갱신합니다.

## 비호환은 머티리얼만이 아니다 — 렌더러 API 도 다르다

`WebGPURenderer` 에는 **`gl.capabilities` 가 없습니다.** `WebGLRenderer` 전용이기 때문입니다. 이것을 읽는 코드는 경고가 아니라 **`Cannot read properties of undefined` 로 앱 전체를 죽입니다.**

drei 의 `GizmoViewport` 가 `gl.capabilities.getMaxAnisotropy()` 한 줄 때문에 여기 걸렸습니다. 머티리얼만 확인하고 통과시켰다가 실제로 크래시를 봤습니다 — **확인해야 할 표면은 머티리얼과 렌더러 API 둘입니다.**

없는 것으로 확인된 API: `capabilities` · `extensions` · `outputEncoding`.

### drei 컴포넌트를 쓰기 전에 확인한다

`node_modules/@react-three/drei/core/<이름>.js` 에서 **둘 다** 찾습니다.

```bash
grep -n "shaderMaterial"                     # 머티리얼 — 조용히 사라짐
grep -n "capabilities\|extensions\|outputEncoding"   # 렌더러 API — 앱이 죽음
```

| 컴포넌트 | 상태 | 비고 |
| --- | --- | --- |
| `Grid` | ❌ 쓸 수 없음 | `shaderMaterial` 기반. three 코어의 `GridHelper` 로 대체 |
| `GizmoViewport` · `GizmoViewcube` | ❌ 쓸 수 없음 | `gl.capabilities.getMaxAnisotropy()`. `AxisGizmo.tsx` 로 대체 |
| `GizmoHelper` | ✅ 사용 중 | Hud 와 카메라 동기화만. `autoClear`·`clearDepth`·`render` 는 WebGPU 에도 있음 |
| `Hud` | ✅ 간접 사용 | 위와 같음 |
| `OrbitControls` | ✅ 사용 중 | 머티리얼도 렌더러 API 도 건드리지 않음 |
| `Text` (troika) | ⚠️ 미확인 | 자체 셰이더를 만들므로 도입 전 확인 필요 |

**표에 없는 것을 새로 도입할 때는 먼저 확인하고 이 표를 채웁니다.** WebGPU를 고른 대가이며, WebGL2 폴백에서만 동작하는 화면을 만들면 N-1의 의미가 사라집니다.

## 렌더러 선택

WebGPU를 우선 시도하고 WebGL2로 폴백합니다. 폴백 자체는 three.js가 하고, 이 코드가 하는 일은 **어느 백엔드가 실제로 선택됐는지 확정해 상태 바에 보고**하는 것입니다.

검증용 URL 질의는 `CLAUDE.md` 실행 절에 있습니다. `?renderer=webgl2` 와 `?renderer=nogpu` 는 **서로 다른 경로**이며, N-1이 요구하는 폴백 확인은 뒤쪽입니다.
