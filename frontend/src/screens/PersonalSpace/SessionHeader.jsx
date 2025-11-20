import React from 'react';

/**
 * Session 标题栏组件（带操作按钮）
 */
export const SessionHeader = ({ 
  session, 
  selectedCount = 0,
  onOpenAll, 
  onDelete,
  onRename 
}) => {
  const hasSelected = selectedCount > 0;

  return (
    <div
      className="session-header"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '16px 20px',
        borderBottom: '1px solid #e0e0e0',
        backgroundColor: 'transparent', // 隐藏白色背景
      }}
    >
      {/* 左侧：Session 名称和标签页数量 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div
          style={{
            fontSize: '16px',
            fontWeight: 500,
            color: '#000',
          }}
        >
          {session.name}
        </div>
        <div
          style={{
            fontSize: '14px',
            color: '#666',
          }}
        >
          {session.tabCount} 个标签页
        </div>
        {hasSelected && (
          <div
            style={{
              fontSize: '14px',
              color: '#1a73e8',
              fontWeight: 500,
            }}
          >
            已选择 {selectedCount} 个
          </div>
        )}
      </div>

      {/* 右侧：操作按钮 */}
      <div style={{ display: 'flex', gap: '12px' }}>
        {/* 全部打开按钮 */}
        <button
          onClick={onOpenAll}
          title={hasSelected ? `打开选中的 ${selectedCount} 个标签页` : '打开所有标签页'}
          style={{
            padding: '6px 16px',
            borderRadius: '6px',
            border: '1px solid #d0d0d0',
            backgroundColor: '#fff',
            color: '#333',
            cursor: 'pointer',
            fontSize: '14px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={(e) => {
            e.target.style.backgroundColor = '#f5f5f5';
            e.target.style.borderColor = '#1a73e8';
          }}
          onMouseLeave={(e) => {
            e.target.style.backgroundColor = '#fff';
            e.target.style.borderColor = '#d0d0d0';
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M8 3V13M3 8H13" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          {hasSelected ? `打开选中 (${selectedCount})` : '全部打开'}
        </button>

        {/* 删除按钮 */}
        <button
          onClick={onDelete}
          title={hasSelected ? `删除选中的 ${selectedCount} 个标签页` : '删除整个 Session'}
          style={{
            padding: '6px 16px',
            borderRadius: '6px',
            border: '1px solid #d0d0d0',
            backgroundColor: '#fff',
            color: '#dc3545',
            cursor: 'pointer',
            fontSize: '14px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={(e) => {
            e.target.style.backgroundColor = '#fff5f5';
            e.target.style.borderColor = '#dc3545';
          }}
          onMouseLeave={(e) => {
            e.target.style.backgroundColor = '#fff';
            e.target.style.borderColor = '#d0d0d0';
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          {hasSelected ? `删除选中 (${selectedCount})` : '删除'}
        </button>
      </div>
    </div>
  );
};



