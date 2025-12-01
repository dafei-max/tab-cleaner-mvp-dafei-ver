# 前端搜索结果适配方案

## 问题

后端返回的搜索结果数量是动态的（1-20 个），取决于搜索质量和过滤策略。前端需要适配这种不确定数量的结果。

## 解决方案

### 1. 搜索遮罩层（SearchOverlay）

**文件**: `frontend/src/screens/PersonalSpace/components/SearchOverlay.jsx`

#### 动态显示策略

```javascript
// 根据结果数量智能调整显示数量
const resultCount = searchResults.length;
let maxDisplayResults = 10;

if (resultCount <= 5) {
  maxDisplayResults = resultCount; // 全部显示
} else if (resultCount <= 10) {
  maxDisplayResults = Math.min(8, resultCount); // 显示前 8 个
} else {
  maxDisplayResults = Math.min(10, resultCount); // 显示前 10 个
}
```

#### 布局适配

- **1-5 个结果**: 单行显示，不换行
- **6-10 个结果**: 允许换行，显示前 8 个
- **11+ 个结果**: 显示前 10 个，并提示"显示 X / Y 个结果"

#### 结果数量提示

```javascript
{hasMoreResults && (
  <div style={{...}}>
    显示 {maxDisplayResults} / {resultCount} 个结果
  </div>
)}
```

### 2. 网格视图（MasonryGrid）

**文件**: `frontend/src/screens/PersonalSpace/MasonryGrid.jsx`

- **自动排序**: 搜索结果按相似度排序
- **高亮显示**: 最相关的结果高亮显示
- **动态布局**: Packery 自动调整布局

### 3. 放射状视图（RadialCanvas）

**文件**: `frontend/src/screens/PersonalSpace/RadialCanvas.jsx`

- **动态布局**: 根据结果数量计算布局
- **中心聚焦**: 最相关的结果在中心
- **向外扩散**: 相似度递减的结果向外排列

### 4. 搜索 Hook（useSearch）

**文件**: `frontend/src/hooks/useSearch.js`

- **结果处理**: 自动处理后端返回的结果
- **本地兜底**: 如果后端失败，使用本地模糊搜索
- **布局计算**: 支持径向布局计算

## 前端适配策略总结

### 1. 响应式布局

- **少量结果（1-5 个）**: 单行显示，充分利用空间
- **中等结果（6-10 个）**: 允许换行，保持美观
- **大量结果（11+ 个）**: 限制显示数量，提示更多结果

### 2. 用户体验优化

- **结果数量提示**: 显示"X / Y 个结果"
- **加载状态**: 显示搜索中状态
- **空结果处理**: 友好的空结果提示

### 3. 性能优化

- **虚拟滚动**: 如果结果很多，考虑虚拟滚动
- **懒加载**: 图片懒加载
- **防抖**: 搜索输入防抖

## 建议的改进

### 1. 分页加载

如果结果很多，可以考虑分页加载：

```javascript
const [page, setPage] = useState(1);
const pageSize = 10;
const displayedResults = searchResults.slice(0, page * pageSize);
```

### 2. 无限滚动

在网格视图中实现无限滚动：

```javascript
const handleScroll = () => {
  if (isNearBottom() && hasMoreResults) {
    loadMoreResults();
  }
};
```

### 3. 结果筛选

允许用户筛选结果（按质量、相似度等）：

```javascript
const [filter, setFilter] = useState('all');
const filteredResults = searchResults.filter(item => {
  if (filter === 'high') return item.quality === 'high';
  if (filter === 'visual') return item.visual_match;
  return true;
});
```

## 测试建议

1. **测试不同数量的结果**: 1 个、5 个、10 个、20 个
2. **测试不同屏幕尺寸**: 移动端、平板、桌面
3. **测试加载状态**: 搜索中、成功、失败
4. **测试交互**: 点击、滚动、筛选

