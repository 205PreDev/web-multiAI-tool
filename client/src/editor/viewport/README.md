# client/src/editor/viewport

R3F 뷰포트와 렌더러 선택.

## 먼저 — 이것은 "WebGPU 문제"가 아니다

경고 문구가 말해줍니다.

```
THREE.NodeBuilder: Material "ShaderMaterial" is not compatible.
```

**`WebGPU` 가 아니라 `NodeBuilder` 입니다.** three.js에는 서로 다른 두 렌더러 계열이 있습니다.

| 렌더러                  | 파이프라인                | 백엔드                 |
| ----------------------- | ------------------------- | ---------------------- |
| `WebGLRenderer` (고전)  | 기존 머티리얼 · GLSL 직접 | WebGL2                 |
| `WebGPURenderer` (우리) | **NodeMaterial · TSL**    | WebGPU **또는 WebGL2** |

**`WebGPURenderer` 는 백엔드가 WebGL2로 내려가도 여전히 NodeMaterial 파이프라인입니다.** 따라서 `?renderer=webgl2` 나 `?renderer=nogpu` 로 폴백해도 `ShaderMaterial` 호환은 돌아오지 않습니다 — 폴백은 **어느 GPU API 를 쓰는가**의 문제이지 **어느 머티리얼 체계를 쓰는가**의 문제가 아닙니다.

그러므로 호환을 되찾는 유일한 방법은 `WebGLRenderer` 로 갈아타는 것이고, 그것은 N-1을 뒤집는 일입니다. **하지 않기로 했으며 근거는 `docs/DECISIONS.md` D-21에 있습니다.**

## 무엇이 깨지는가 — 실측

`@react-three/drei` 123개 컴포넌트를 훑은 결과입니다(2026-08-10, drei 10.7.8).

| 분류                                                    |  수 | 비율 |
| ------------------------------------------------------- | --: | ---: |
| `ShaderMaterial` 사용 — **조용히 사라짐**               |  13 |  11% |
| 렌더러 전용 API(`capabilities` 등) 사용 — **앱이 죽음** |   3 |   2% |

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

| 컴포넌트                          | 상태       | 비고                                                          |
| --------------------------------- | ---------- | ------------------------------------------------------------- |
| `OrbitControls`                   | ✅ 사용 중 | 머티리얼도 렌더러 API 도 건드리지 않음                        |
| `GizmoHelper` · `Hud`             | ✅ 사용 중 | `autoClear`·`clearDepth`·`render` 는 양쪽에 다 있음           |
| `TransformControls`               | ✅ 확인함  | A-3의 기즈모. 1단계에서 씀                                    |
| `Grid`                            | ❌ 막힘    | `shaderMaterial`. three 코어 `GridHelper` 로 대체             |
| `GizmoViewport` · `GizmoViewcube` | ❌ 막힘    | `gl.capabilities.getMaxAnisotropy()`. `AxisGizmo.tsx` 로 대체 |
| `Text`                            | ❌ 막힘    | troika 가 `onBeforeCompile` 로 셰이더를 파생함                |
| `Outlines`                        | ❌ 막힘    | **대체함** — 아래 참조                                        |
| `Edges` · `Line`                  | ⚠️ 안 씀   | drei `Line` 이 `LineMaterial`(ShaderMaterial 파생)에 얹혀 있음 |
| `ContactShadows`                  | ❌ 막힘    | 현재는 `shadowMaterial` 을 직접 써서 필요 없음                |

**새로 도입할 때마다 확인하고 이 표를 채웁니다.**

`Edges`·`Line` 은 **위의 "13개" 집계에 들어 있지 않습니다.** drei 폴더 안에서 `ShaderMaterial` 을 찾아도 안 걸리고, 문제는 그것이 import 하는 `LineMaterial` 에 있기 때문입니다 — 위의 "세 번째로, 자체 셰이더를 파생하는 외부 의존도 봅니다"가 실제로 필요했던 사례입니다. 이 항목들은 실행해서 확인한 것이 아니라 소스를 따라간 판정이므로, 쓰게 되면 먼저 화면으로 확인합니다.

### 선택 외곽선을 무엇으로 그리는가 (A-2)

`Outlines` 대신 **three 코어의 `EdgesGeometry` + `LineBasicMaterial`** 을 씁니다(`SceneNodes.tsx`). 코어 머티리얼은 NodeMaterial 로 변환되며, 이미 같은 경로로 그려지고 있는 `gridHelper` 가 그 증거입니다.

**모서리를 거는 대상은 메시가 아니라 그 메시의 경계 상자입니다.** 메시에 직접 걸면 안 되는 이유가 있습니다 — `EdgesGeometry` 의 기본 임계각은 1도인데 구는 인접면 사이가 약 11도라 **모든 삼각형 변이 남아 선 천 개짜리 위경도 그물**이 됩니다. 임계각을 올리면 이번에는 구에서 아무 선도 안 남습니다. **둥근 것에는 걸 모서리가 없다는 뜻이므로**, 종류마다 다르게 하지 않고 전부 경계 상자로 통일합니다.

- 박스·평면에서는 형태와 일치하고, 둥근 것에서는 12개의 선으로 "이것이 골라졌다"를 말합니다. 3단계의 생성 메시가 들어와도 비용이 같습니다.
- 지오메트리는 종류마다 하나씩 모듈 수준에서 만들어 공유합니다. 노드마다 만들면 같은 상자 백 개가 GPU 버퍼 백 개가 됩니다.
- `depthTest={false}` 라 오브젝트에 가려도 보입니다 — 뒤에 있는 것을 골랐을 때 표시가 사라지면 무엇을 골랐는지 알 수 없습니다. 이것과 위의 그물이 겹치면 그물이 씬 전체를 덮습니다.

라이트는 그려질 몸이 없어 **작은 구를 대리로 놓습니다.** 없으면 씬 그래프에는 있는데 뷰포트 어디에도 없는 노드가 되어 선택도 이동도 확인할 수 없습니다.

## 되돌리는 기준 (D-21의 tripwire)

지금 판단은 "막힌 것을 우리가 대체한다"입니다. 그 비용이 예상을 넘으면 재검토합니다. **아래 중 하나라도 걸리면 D-21을 다시 엽니다.**

1. 손으로 대체한 컴포넌트가 **5개를 넘을 때** (현재 3개 — `Grid`, `GizmoViewport`, `Outlines`)
2. **P0 요구사항 하나가 대체 불가로 막힐 때**
3. 대체 코드의 총량이 **300줄을 넘을 때** (현재 약 170줄)

## 렌더러 선택

WebGPU를 우선 시도하고 WebGL2 백엔드로 폴백합니다. 폴백 자체는 three.js가 하고, 이 코드가 하는 일은 **어느 백엔드가 실제로 선택됐는지 확정해 상태 바에 보고**하는 것입니다.

검증용 URL 질의는 `CLAUDE.md` 실행 절에 있습니다. `?renderer=webgl2` 와 `?renderer=nogpu` 는 서로 다른 경로이며, N-1이 요구하는 폴백 확인은 뒤쪽입니다. **다시 강조하면 둘 다 NodeMaterial 파이프라인이므로 호환 문제는 그대로입니다.**
