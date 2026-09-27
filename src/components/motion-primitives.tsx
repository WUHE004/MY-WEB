"use client";

/**
 * 全站共享的动画基础组件
 * - CountUp: 数字滚动（筛选/轮询导致数值变化时 spring 补间）
 * - PulseOnChange: 数值变化时整块轻微脉冲（尺码数量卡片等）
 * - NumberPop: 小数字变化时弹跳（合计件数等）
 * - staggerContainer / staggerItem: 列表交错入场变体
 *
 * 所有组件均尊重系统"减弱动态效果"（prefers-reduced-motion）设置，
 * 仅动画 transform/opacity，遵循 GPU 加速原则。
 */

import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  useAnimationControls,
  useReducedMotion,
} from "framer-motion";
import { useEffect, useRef, type ReactNode } from "react";

interface CountUpProps {
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  /** 自定义格式化函数（如 platform-fee 的 M/万 缩写），提供时忽略 decimals */
  format?: (n: number) => string;
  className?: string;
}

/**
 * 数字滚动：value 变化时用 spring 补间到新值。
 * 通过 MotionValue 直接驱动 DOM 文本更新，不触发 React 重渲染。
 */
export function CountUp({ value, prefix = "", suffix = "", decimals = 0, format, className }: CountUpProps) {
  const reduced = useReducedMotion();
  const mv = useMotionValue(value);
  const spring = useSpring(mv, { stiffness: 90, damping: 22 });

  useEffect(() => {
    mv.set(value);
  }, [value, mv]);

  const text = useTransform(reduced ? mv : spring, (v: number) => {
    const formatted = format
      ? format(v)
      : v.toLocaleString("zh-CN", {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        });
    return `${prefix}${formatted}${suffix}`;
  });

  return (
    <motion.span className={className} style={{ display: "inline-block" }}>
      {text}
    </motion.span>
  );
}

interface PulseOnChangeProps {
  value: number;
  children: ReactNode;
  className?: string;
}

/** 数值变化时整块轻微脉冲一次（scale 1 → 1.05 → 1），不改变 DOM 结构语义 */
export function PulseOnChange({ value, children, className }: PulseOnChangeProps) {
  const reduced = useReducedMotion();
  const controls = useAnimationControls();
  const prev = useRef(value);

  useEffect(() => {
    if (prev.current !== value) {
      prev.current = value;
      if (!reduced) {
        controls.start({
          scale: [1, 1.05, 1],
          transition: { duration: 0.25, ease: "easeOut" },
        });
      }
    }
  }, [value, controls, reduced]);

  return (
    <motion.div animate={controls} className={className}>
      {children}
    </motion.div>
  );
}

interface NumberPopProps {
  value: number | string;
  className?: string;
}

/** 小数字变化时弹跳（key 重挂触发 spring），如"合计: N 件" */
export function NumberPop({ value, className }: NumberPopProps) {
  const reduced = useReducedMotion();
  if (reduced) {
    return <span className={className}>{value}</span>;
  }
  return (
    <motion.span
      key={value}
      initial={{ scale: 1.4, opacity: 0.5 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 500, damping: 20 }}
      className={"inline-block " + (className ?? "")}
    >
      {value}
    </motion.span>
  );
}

/** 列表交错入场：容器 + 子项变体（配合 motion.div variants 使用） */
export const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.06 },
  },
};

export const staggerItem = {
  hidden: { opacity: 0, y: 14 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: "easeOut" as const },
  },
};
