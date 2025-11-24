import { Canvas, useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';

/**
 * 渐变网格组件 - 使用自定义 shader 创建动画渐变效果
 */
const GradientMesh = () => {
  const mesh = useRef();

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
      uColor1: { value: new THREE.Color('#CCE1F4') },
      uColor2: { value: new THREE.Color('#E3EBF5') },
      uColor3: { value: new THREE.Color('#D4E3F1') },
    }),
    []
  );

  const vertexShader = `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;

  const fragmentShader = `
    uniform float uTime;
    uniform vec2 uResolution;
    uniform vec3 uColor1; // #CCE1F4 - 最浅色
    uniform vec3 uColor2; // #E3EBF5 - 中间色
    uniform vec3 uColor3; // #D4E3F1 - 深色
    varying vec2 vUv;
    
    #define S(a,b,t) smoothstep(a,b,t)
    
    mat2 Rot(float a) {
      float s = sin(a);
      float c = cos(a);
      return mat2(c, -s, s, c);
    }
    
    // Created by inigo quilez - iq/2014
    // License Creative Commons Attribution-NonCommercial-ShareAlike 3.0 Unported License.
    vec2 hash( vec2 p ) {
      p = vec2( dot(p,vec2(2127.1,81.17)), dot(p,vec2(1269.5,283.37)) );
      return fract(sin(p)*43758.5453);
    }
    
    float noise( in vec2 p ) {
      vec2 i = floor( p );
      vec2 f = fract( p );
      
      vec2 u = f*f*(3.0-2.0*f);
      
      float n = mix( mix( dot( -1.0+2.0*hash( i + vec2(0.0,0.0) ), f - vec2(0.0,0.0) ), 
                          dot( -1.0+2.0*hash( i + vec2(1.0,0.0) ), f - vec2(1.0,0.0) ), u.x),
                     mix( dot( -1.0+2.0*hash( i + vec2(0.0,1.0) ), f - vec2(0.0,1.0) ), 
                          dot( -1.0+2.0*hash( i + vec2(1.0,1.0) ), f - vec2(1.0,1.0) ), u.x), u.y);
      return 0.5 + 0.5*n;
    }
    
    void main() {
      vec2 uv = vUv;
      float ratio = uResolution.x / uResolution.y;
      
      vec2 tuv = uv;
      tuv -= .5;
      
      // rotate with Noise
      float degree = noise(vec2(uTime*.1, tuv.x*tuv.y));
      
      tuv.y *= 1./ratio;
      tuv *= Rot(radians((degree-.5)*720.+180.));
      tuv.y *= ratio;
      
      // Wave warp with sin
      float frequency = 5.;
      float amplitude = 30.;
      float speed = uTime * 2.;
      tuv.x += sin(tuv.y*frequency+speed)/amplitude;
      tuv.y += sin(tuv.x*frequency*1.5+speed)/(amplitude*.5);
      
      // draw the image - 使用我们的三个颜色
      // layer1: 从 uColor1 (#fafffc) 到 uColor2 (#ebf5ff)
      vec3 layer1 = mix(uColor1, uColor2, S(-.3, .2, (tuv*Rot(radians(-5.))).x));
      
      // layer2: 从 uColor2 (#ebf5ff) 到 uColor3 (#c2dfff)
      vec3 layer2 = mix(uColor2, uColor3, S(-.3, .2, (tuv*Rot(radians(-5.))).x));
      
      // 混合两层
      vec3 finalComp = mix(layer1, layer2, S(.5, -.3, tuv.y));
      
      // 添加白色 grain（颗粒感）效果
      vec2 grainCoord = uv * uResolution.xy;
      float grain = fract(sin(dot(grainCoord + uTime * 10.0, vec2(12.9898, 78.233))) * 43758.5453);
      grain = (grain - 0.5) * 0.4; // ⬅️ 调整颗粒强度：0.4 是当前强度（可以改成 0.05-0.5）
      
      // 白色颗粒：将 grain 应用到所有 RGB 通道
      vec3 whiteGrain = vec3(grain);
      vec3 col = finalComp + whiteGrain;
      
      gl_FragColor = vec4(col, 1.0);
    }
  `;

  useFrame((state) => {
    uniforms.uTime.value = state.clock.getElapsedTime();
    // 更新分辨率
    uniforms.uResolution.value.set(window.innerWidth, window.innerHeight);
  });

  return (
    <mesh ref={mesh} scale={[2, 2, 1]} position={[0, 0, 0]}>
      <planeGeometry args={[1, 1, 1, 1]} />
      <shaderMaterial
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
};

/**
 * 动画渐变背景组件
 * 使用 Three.js + @react-three/fiber 实现自定义 shader 渐变背景
 * 
 * @param {Object} props
 * @param {string} props.className - 可选，用来控制容器
 * @param {Object} props.style - 可选，用来控制容器样式
 */
export default function FlowingSkyBackground({
  className,
  style,
}) {
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
        height: "100vh",
        zIndex: 0,
        overflow: "hidden",
        pointerEvents: "none", // 确保背景不拦截鼠标事件
        filter: 'blur(40px) contrast(1.5)',
        ...style,
      }}
    >
      <Canvas
        camera={{ position: [0, 0, 1], fov: 75 }}
        style={{ width: '100%', height: '100%', display: 'block' }}
        gl={{ 
          alpha: false, 
          antialias: true, 
          preserveDrawingBuffer: false,
          powerPreference: "high-performance"
        }}
        dpr={[1, 2]}
        frameloop="always"
      >
        <color attach="background" args={['#CCE1F4']} />
        <GradientMesh />
      </Canvas>
    </div>
  );
}
