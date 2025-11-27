import React from "react";

/**
 * OpenGraph 卡片组件
 * 显示完整的 OpenGraph 数据
 */
export const OpenGraphCard = ({ data, onClose }) => {
  if (!data) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        style={{
          backgroundColor: '#fff',
          borderRadius: '16px',
          maxWidth: '600px',
          maxHeight: '80vh',
          overflow: 'auto',
          boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
          position: 'relative',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 关闭按钮 */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            border: 'none',
            backgroundColor: 'rgba(0,0,0,0.1)',
            cursor: 'pointer',
            fontSize: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10,
          }}
          onMouseEnter={(e) => {
            e.target.style.backgroundColor = 'rgba(0,0,0,0.2)';
          }}
          onMouseLeave={(e) => {
            e.target.style.backgroundColor = 'rgba(0,0,0,0.1)';
          }}
        >
          ×
        </button>

        {/* 图片 */}
        {data.image && (
          <img
            src={data.image}
            alt={data.title || ''}
            style={{
              width: '100%',
              height: '300px',
              objectFit: 'cover',
              borderTopLeftRadius: '16px',
              borderTopRightRadius: '16px',
            }}
            onError={(e) => {
              e.target.style.display = 'none';
            }}
          />
        )}

        {/* 内容 */}
        <div style={{ padding: '24px' }}>
          {/* 站点名称 */}
          {data.site_name && (
            <div
              style={{
                fontSize: '14px',
                color: '#666',
                marginBottom: '8px',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}
            >
              {data.site_name}
            </div>
          )}

          {/* 标题 */}
          {data.title && (
            <h2
              style={{
                fontSize: '24px',
                fontWeight: 'bold',
                marginBottom: '12px',
                color: '#333',
                lineHeight: '1.3',
              }}
            >
              {data.title}
            </h2>
          )}

          {/* 描述 */}
          {data.description && (
            <p
              style={{
                fontSize: '16px',
                color: '#666',
                lineHeight: '1.6',
                marginBottom: '16px',
              }}
            >
              {data.description}
            </p>
          )}

          {/* URL */}
          {data.url && (
            <a
              href={data.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: '14px',
                color: '#61caff',
                textDecoration: 'none',
                wordBreak: 'break-all',
                display: 'inline-block',
                marginTop: '8px',
              }}
              onMouseEnter={(e) => {
                e.target.style.textDecoration = 'underline';
              }}
              onMouseLeave={(e) => {
                e.target.style.textDecoration = 'none';
              }}
            >
              {data.url}
            </a>
          )}

          {/* 错误信息 */}
          {data.error && (
            <div
              style={{
                padding: '12px',
                backgroundColor: '#fff3cd',
                borderRadius: '8px',
                color: '#856404',
                marginTop: '16px',
              }}
            >
              获取数据时出错: {data.error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};







