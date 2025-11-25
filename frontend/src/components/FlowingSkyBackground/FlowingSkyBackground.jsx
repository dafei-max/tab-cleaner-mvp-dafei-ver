import { Canvas, useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { getImageUrl } from '../../shared/utils';

/**
 * 渐变网格组件 - 使用自定义 shader 创建动画渐变效果
 */
const GradientMesh = () => {
  const mesh = useRef();

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
      uColor1: { value: new THREE.Color('#F2F7FD') }, // 最浅、偏冷色
      uColor2: { value: new THREE.Color('#DCEBFA') }, // 中间过渡色
      uColor3: { value: new THREE.Color('#7FAFE3') }, // 更纯更深的蓝色
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
      float frequency = 6.;
      float amplitude = 25.;
      float speed = uTime * 4.;
      tuv.x += sin(tuv.y*frequency+speed)/amplitude;
      tuv.y += sin(tuv.x*frequency*1.5+speed)/(amplitude*.5);
      
      // draw the image - 使用我们的三个颜色
      // layer1: 从 uColor1 到 uColor2
      vec3 layer1 = mix(uColor1, uColor2, S(-.3, .2, (tuv*Rot(radians(-5.))).x));
      
      // layer2: 从 uColor2 到 uColor3
      vec3 layer2 = mix(uColor2, uColor3, S(-.3, .2, (tuv*Rot(radians(-5.))).x));
      
      // 使用噪声来创建随机的混合权重，让深色分布更随机
      float noiseMix = noise(vec2(tuv.x * 2.0 + uTime * 0.1, tuv.y * 2.0 + uTime * 0.15));
      // 反转分布：让深色（layer2）在下方和随机位置出现
      float mixFactor = mix(S(-.3, .5, tuv.y), noiseMix * 0.5 + 0.5, 0.4);
      vec3 finalComp = mix(layer1, layer2, mixFactor);
      
      // 添加更明显的 noise/grain 纹理效果
      // 使用多层噪声创建更丰富的 grain 纹理
      vec2 grainUV1 = uv * uResolution.xy * 0.8; // 较大颗粒
      vec2 grainUV2 = uv * uResolution.xy * 1.5; // 较小颗粒
      float grain1 = noise(grainUV1 + uTime * 0.3);
      float grain2 = noise(grainUV2 + uTime * 0.7);
      // 混合两层噪声，增强可见度
      float grain = mix(grain1, grain2, 0.5);
      // 增强 noise 的可见度（从 0.0-1.0 映射到 -0.2 到 0.2，然后叠加）
      float grainAmount = (grain - 0.5) * 0.4; // 增加强度到 0.4，使 noise 更明显
      vec3 col = finalComp + grainAmount;
      
      gl_FragColor = vec4(col, 1.0);
    }
  `;

  useFrame((state) => {
    uniforms.uTime.value = state.clock.getElapsedTime();
    // 更新分辨率
    uniforms.uResolution.value.set(window.innerWidth, window.innerHeight);
  });

  return (
    <mesh ref={mesh} scale={[3, 2.5, 1]} position={[0, 0, 0]}>
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
        filter: 'blur(10px) contrast(1.2)',
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
        <color attach="background" args={['#E3EBF5']} />
        <GradientMesh />
      </Canvas>
      {/* Filter 遮罩层 */}
      <img
        src={getImageUrl("filter.png")}
        alt="Filter overlay"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          pointerEvents: 'none',
          zIndex: 1,
        }}
      />
    </div>
  );
}
