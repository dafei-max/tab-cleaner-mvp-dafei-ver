import { getImageUrl } from "../../shared/utils";

/**
 * 静态天空背景组件
 * 使用 background-space.png 图片作为背景
 * 
 * @param {Object} props
 * @param {string} props.className - 可选，用来控制容器
 * @param {Object} props.style - 可选，用来控制容器样式
 */
export default function FlowingSkyBackground({
  className,
  style,
}) {
  const backgroundImageUrl = getImageUrl('background-space.png');

  return (
    <div
      className={className}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: "100%",
        height: "100%",
        zIndex: 0,
        overflow: "hidden",
        pointerEvents: "none", // 确保背景不拦截鼠标事件
        backgroundImage: `url(${backgroundImageUrl})`,
        backgroundSize: "cover", // 撑满画面，保持比例
        backgroundPosition: "center", // 居中显示
        backgroundRepeat: "no-repeat", // 不重复
        ...style,
      }}
    />
  );
}
