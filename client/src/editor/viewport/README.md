# client/src/editor/viewport

R3F 뷰포트와 렌더러 선택.

## 먼저 — 이것은 "WebGPU 문제"가 아니다

경고 문구가 말해줍니다.

```
THREE.NodeBuilder: Material "ShaderMaterial" is not compatible.
```

**`WebGPU` 가 아니라 `NodeBuilder` 입니다.** three.js에는 서로 다른 두 렌더러 계열이 있습니다.

| 렌더러 | 파이프라인 | 백엔드 |
| --- | --- | --- |
| `WebGLRenderer` (고전) | 기존 머티리얼 · GLSL 직접 | WebGL2 |
| `WebGPURenderer` (우리) | **NodeMaterial · TSL** | WebGPU **또는 WebGL2** |

**`WebGPURenderer` 는 백엔드가 WebGL2로 내려가도 여전히 NodeMaterial 파이프라인입니다.** 따라서 `?renderer=webgl2` 나 `?renderer=nogpu` 로 폴백해도 `ShaderMaterial` 호환은 돌아오지 않습니다 — 폴백은 **어느 GPU API 를 쓰는가**의 문제이지 **어느 머티리얼 체계를 쓰는가**의 문제가 아닙니다.

그러므로 호환을 되찾는 유일한 방법은 `WebGLRenderer` 로 갈아타는 것이고, 그것은 N-1을 뒤집는 일입니다. **하지 않기로 했으며 근거는 `docs/DECISIONS.md` D-21에 있습니다.**

## 무엇이 깨지는가 — 실측

`@react-three/drei` 123개 컴포넌트를 훑은 결과입니다(2026-08-10, drei 10.7.8).

| 분류 | 수 | 비율 |
| --- | ---: | ---: |
| `ShaderMaterial` 사용 — **조용히 사라짐** | 13 | 11% |
| 렌더러 전용 API(`capabilities` 등) 사용 — **앱이 죽음** | 3 | 2% |

**막힌 것은 대부분 시각 효과입니다.** `AccumulativeShadows` · `Caustics` · `ContactShadows` · `Grid` · `Image` · `MeshPortalMaterial` · `Outlines` · `Sparkles` · `Splat` · `SpotLight` · `Stars` · `GizmoViewport` · `GizmoViewcube` · `PointMaterial`.

**P0 요구사항이 걸린 것은 전부 깨끗합니다** — `TransformControls`(A-3 기즈모) · `OrbitControls`(A-1) · `Line` · `Bounds` · `Environment`.

## 확인 방법

새 컴포넌트를 도입하기 전에 **둘 다** 봅니다.

```bash
cd node_modules/@react-three/drei/core
grep -n "shaderMaterial\|ShaderMaterial" <이름>.js      # 조용히 사라짐
grep -n "capabilities\|\.extensions\b" <이름>.js         # 앱이 죽음
```

세 번째로, **자체 셰이더를 파생하는 외부 의존**도 봅니다. `onBeforeCompile` 로 GLSL을 주입하는 라이브러리는 NodeMaterial 에서 동작하지 않습니다.

## 호환 표

| 컴포넌트 | 상태 | 비고 |
| --- | --- | --- |
| `OrbitControls` | ✅ 사용 중 | 머티리얼도 렌더러 API 도 건드리지 않음 |
| `GizmoHelper` · `Hud` | ✅ 사용 중 | `autoClear`·`clearDepth`·`render` 는 양쪽에 다 있음 |
| `TransformControls` | ✅ 확인함 | A-3의 기즈모. 1단계에서 씀 |
| `Grid` | ❌ 막힘 | `shaderMaterial`. three 코어 `GridHelper` 로 대체 |
| `GizmoViewport` · `GizmoViewcube` | ❌ 막힘 | `gl.capabilities.getMaxAnisotropy()`. `AxisGizmo.tsx` 로 대체 |
| `Text` | ❌ 막힘 | troika 가 `onBeforeCompile` 로 셰이더를 파생함 |
| `Outlines` | ❌ 막힘 | 선택 표시에 쓰려면 대안이 필요 |
| `ContactShadows` | ❌ 막힘 | 현재는 `shadowMaterial` 을 직접 써서 필요 없음 |

**새로 도입할 때마다 확인하고 이 표를 채웁니다.**

## 되돌리는 기준 (D-21의 tripwire)

지금 판단은 "막힌 것을 우리가 대체한다"입니다. 그 비용이 예상을 넘으면 재검토합니다. **아래 중 하나라도 걸리면 D-21을 다시 엽니다.**

1. 손으로 대체한 컴포넌트가 **5개를 넘을 때** (현재 2개 — `Grid`, `GizmoViewport`)
2. **P0 요구사항 하나가 대체 불가로 막힐 때**
3. 대체 코드의 총량이 **300줄을 넘을 때** (현재 약 150줄)

## 렌더러 선택

WebGPU를 우선 시도하고 WebGL2 백엔드로 폴백합니다. 폴백 자체는 three.js가 하고, 이 코드가 하는 일은 **어느 백엔드가 실제로 선택됐는지 확정해 상태 바에 보고**하는 것입니다.

검증용 URL 질의는 `CLAUDE.md` 실행 절에 있습니다. `?renderer=webgl2` 와 `?renderer=nogpu` 는 서로 다른 경로이며, N-1이 요구하는 폴백 확인은 뒤쪽입니다. **다시 강조하면 둘 다 NodeMaterial 파이프라인이므로 호환 문제는 그대로입니다.**
