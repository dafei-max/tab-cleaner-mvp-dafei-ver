import { useEffect, useRef } from "react";
import * as THREE from "three";

/**
 * 流动天空背景组件
 * 
 * @param {Object} props
 * @param {number} props.speed - 流动速度（越大流动越快），默认 0.04
 * @param {number} props.noiseScale - 噪声整体尺度（越大云块越细腻，越小越大块），默认 1.6
 * @param {string[]} props.colors - [cA, cB, cC, cD]，4 个 hex 颜色，默认为 ["#62A5EB", "#6FABE7", "#EAF6FD", "#B4D2E4"]
 * @param {string} props.className - 可选，用来控制容器
 * @param {Object} props.style - 可选，用来控制容器样式
 */
export default function FlowingSkyBackground({
  speed = 0.04,
  noiseScale = 1.6,
  colors = ["#62A5EB", "#6FABE7", "#EAF6FD", "#B4D2E4"],
  className,
  style,
}) {
  const mountRef = useRef(null);
  const uniformsRef = useRef(null);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    // 场景 & 相机
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    // 渲染器
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    renderer.setSize(width, height);
    container.appendChild(renderer.domElement);

    // uniforms
    const uniforms = {
      u_time: { value: 0 },
      u_resolution: { value: new THREE.Vector2(width, height) },
      u_speed: { value: speed },
      u_noiseScale: { value: noiseScale },
      u_colorA: { value: new THREE.Color(colors[0]) }, // #62A5EB
      u_colorB: { value: new THREE.Color(colors[1]) }, // #6FABE7
      u_colorC: { value: new THREE.Color(colors[2]) }, // #EAF6FD
      u_colorD: { value: new THREE.Color(colors[3]) }, // #B4D2E4
    };

    uniformsRef.current = uniforms;

    const vertexShader = `
      varying vec2 vUv;

      void main() {
        vUv = uv;
        gl_Position = vec4(position, 1.0);
      }
    `;

    const fragmentShader = `
      precision highp float;

      uniform float u_time;
      uniform vec2 u_resolution;
      uniform float u_speed;
      uniform float u_noiseScale;
      uniform vec3 u_colorA;
      uniform vec3 u_colorB;
      uniform vec3 u_colorC;
      uniform vec3 u_colorD;

      varying vec2 vUv;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        float a = hash(i);
        float b = hash(i + vec2(1.0, 0.0));
        float c = hash(i + vec2(0.0, 1.0));
        float d = hash(i + vec2(1.0, 1.0));
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(a, b, u.x) +
               (c - a) * u.y * (1.0 - u.x) +
               (d - b) * u.x * u.y;
      }

      float fbm(vec2 p) {
        float value = 0.0;
        float amp = 0.5;
        float freq = 1.0;
        for (int i = 0; i < 5; i++) {
          value += amp * noise(p * freq);
          freq *= 2.0;
          amp *= 0.5;
        }
        return value;
      }

      void main() {
        vec2 uv = vUv;

        // 轻微横向拉伸，更接近参考图比例
        uv.x *= u_resolution.x / u_resolution.y;

        // 时间控制（由 u_speed 控制）
        float t = u_time * u_speed;

        // 两层不同尺度的云雾噪声
        float n1 = fbm(uv * (1.0 * u_noiseScale) + vec2(t, t * 0.7));
        float n2 = fbm(uv * (0.6 * u_noiseScale) - vec2(t * 0.5, t));
        float n = mix(n1, n2, 0.5);

        // 基础天空渐变：从偏饱和蓝过渡到柔蓝
        vec3 grad1 = mix(u_colorA, u_colorB, smoothstep(0.0, 1.0, uv.y));

        // 云层与高光区域：由噪声控制
        float highlight = smoothstep(0.55, 0.95, n);
        vec3 grad2 = mix(u_colorD, u_colorC, highlight);

        // 叠加两层：75% 云层结构 + 25% 基础渐变
        vec3 color = mix(grad1, grad2, 0.75);

        // 整体再向高光颜色轻轻偏一点，增加"空气感"
        color = mix(color, u_colorC, 0.12);

        gl_FragColor = vec4(color, 1.0);
      }
    `;

    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader,
      fragmentShader,
    });

    const geometry = new THREE.PlaneGeometry(2, 2);
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    const clock = new THREE.Clock();
    let animationId;

    const render = () => {
      uniforms.u_time.value = clock.getElapsedTime();
      renderer.render(scene, camera);
      animationId = requestAnimationFrame(render);
    };

    render();

    const handleResize = () => {
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      renderer.setSize(w, h);
      uniforms.u_resolution.value.set(w, h);
    };

    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener("resize", handleResize);
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      uniformsRef.current = null;
    };
  }, []); // 只初始化一次

  // 当 props 变化时，更新 uniforms（不用重新创建 WebGL）
  useEffect(() => {
    const uniforms = uniformsRef.current;
    if (!uniforms) return;

    uniforms.u_speed.value = speed;
    uniforms.u_noiseScale.value = noiseScale;
    if (colors[0]) uniforms.u_colorA.value.set(colors[0]);
    if (colors[1]) uniforms.u_colorB.value.set(colors[1]);
    if (colors[2]) uniforms.u_colorC.value.set(colors[2]);
    if (colors[3]) uniforms.u_colorD.value.set(colors[3]);
  }, [speed, noiseScale, colors]);

  return (
    <div
      ref={mountRef}
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
        ...style,
      }}
    />
  );
}

