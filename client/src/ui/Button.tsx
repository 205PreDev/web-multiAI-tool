import type { ComponentPropsWithoutRef } from 'react'
import styles from './Button.module.css'

/**
 * 에디터와 공개 화면이 함께 쓰는 버튼 (N-14).
 *
 * **`className` 을 받지 않는다.** 받으면 호출부가 리터럴 색·치수를 얹는 통로가 되고,
 * 그 순간 "컴포넌트가 semantic 토큰만 참조한다"가 컴포넌트 밖에서 깨진다.
 * 필요한 모양은 variant 로 추가한다.
 */

type Variant = 'default' | 'ghost' | 'danger' | 'accent'
type Size = 'md' | 'sm' | 'icon'

interface ButtonProps extends Omit<ComponentPropsWithoutRef<'button'>, 'className'> {
  variant?: Variant
  size?: Size
}

const variantClass: Record<Variant, string> = {
  default: '',
  ghost: styles.ghost ?? '',
  danger: styles.danger ?? '',
  accent: styles.accent ?? '',
}

const sizeClass: Record<Size, string> = {
  md: '',
  sm: styles.sm ?? '',
  icon: styles.icon ?? '',
}

export function Button({ variant = 'default', size = 'md', type, ...rest }: ButtonProps) {
  const classes = [styles.button, variantClass[variant], sizeClass[size]].filter(Boolean).join(' ')

  // 기본값이 'submit' 이라 폼 안에서 뜻하지 않게 제출한다. 에디터의 버튼은 거의 전부 'button' 이다.
  return <button type={type ?? 'button'} className={classes} {...rest} />
}
