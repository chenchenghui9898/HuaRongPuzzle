# 生成一个 Node.js 导入脚本

**提示词：**

请帮我生成一个 Node.js 导入脚本 `scripts/import-puzzles.js`，用于将已有的拼图批量导入到拼图广场。

---

## 一、现有表结构（必须严格对齐）

```plaintext
create table public.puzzles (
  id text not null,
  image_url text not null,
  grid_size integer not null,
  moves text not null,
  hidden_index integer not null,
  created_at text not null default ((now() AT TIME ZONE 'utc'::text))::text,
  name text not null default 'HuaRongImage'::text,
  last_opened_at text null,
  cover_fragment_url text null,
  published_to_square boolean default false,
  rose_count integer default 0,
  slipper_count integer default 0,
  open_count integer default 0,
  complete_count integer default 0,
  device_id text null,
  user_id uuid null,
  constraint puzzles_pkey primary key (id)
);
```

### 字段说明

*   `id`：text 类型，用 `gen_random_uuid()`或 `crypto.randomUUID()`生成
    
*   `grid_size`：对应难度（3,4,5,6,7）
    
*   `moves`：打乱顺序的 JSON 字符串，导入初始拼图时可以先填一个合法的默认值
    
*   `created_at`和 `last_opened_at`：text 类型，用 `new Date().toISOString()`格式
    
*   `hidden_index`：取值范围 `0 ~ grid_size*grid_size - 1`
    

---

## 二、输入数据格式

脚本读取 `scripts/seed-puzzles.json`，格式如下：

```plaintext
[
  {
    "name": "雪山日落",
    "imageUrl": "https://example.com/images/snow_mountain.jpg",
    "gridSize": 4,
    "hiddenIndex": 15
  },
  {
    "name": "猫咪合照",
    "imageUrl": "https://example.com/images/cat_group.jpg",
    "gridSize": 3,
    "hiddenIndex": 8
  }
]
```

### 字段说明

*   `name`：拼图名称
    
*   `imageUrl`：已有图片的公网 URL
    
*   `gridSize`：难度（3-7）
    
*   `hiddenIndex`：隐藏块位置，合法范围 `0 ~ gridSize*gridSize - 1`
    

---

## 三、脚本功能要求

对 JSON 中每个条目依次执行以下操作：

### 1. 检查是否已存在（可选，防重复导入）

*   按 `name`查询 Supabase `puzzles`表，如果已存在则跳过（打印"已存在，跳过"）
    

### 2. 上传原图到 Cloudinary

```plaintext
const result = await cloudinary.uploader.upload(item.imageUrl, {
  folder: 'puzzles',
  overwrite: true
});
```

获取 `result.secure_url`和 `result.public_id`。

### 3. 检查并生成碎片封面 URL

*   先用 `result.public_id`构造 Cloudinary 变换 URL（200×200 中心裁剪）
    
*   **检查该碎片封面 URL 是否可访问**（用 HTTP HEAD 请求）
    
*   如果可访问，直接使用该 URL 作为 `cover_fragment_url`
    
*   如果不可访问，用 Cloudinary URL 变换生成：
    

```plaintext
const coverFragmentUrl = cloudinary.url(result.public_id, {
  width: 200,
  height: 200,
  crop: 'crop',
  gravity: 'center',
  quality: 'auto',
  fetch_format: 'auto'
});
```

### 4. 生成合法 moves 值

生成一个合法的初始打乱顺序（从目标状态执行 `gridSize * gridSize * 50`次合法随机移动），序列化为 JSON 字符串。

### 5. 插入 Supabase

构造与 `puzzles`表字段完全对齐的对象并插入：

```plaintext
const { data, error } = await supabase
  .from('puzzles')
  .insert({
    id: crypto.randomUUID(),
    name: item.name,
    image_url: result.secure_url,
    grid_size: item.gridSize,
    moves: JSON.stringify(shuffledMoves),
    hidden_index: item.hiddenIndex,
    created_at: new Date().toISOString(),
    last_opened_at: new Date().toISOString(),
    cover_fragment_url: coverFragmentUrl,
    published_to_square: true,
    rose_count: 0,
    slipper_count: 0,
    open_count: 0,
    complete_count: 0,
    device_id: 'seed-import',
    user_id: null
  })
  .select('id')
  .single();
```
---

## 四、技术依赖

使用以下 npm 包：

*   `@supabase/supabase-js`：Supabase 客户端
    
*   `cloudinary`：Cloudinary SDK
    
*   `dotenv`：读取环境变量
    
*   `node-fetch`或内置 `https`模块：用于检查碎片封面 URL 是否可访问
    

环境变量（从 `.env`读取）：

```plaintext
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
CLOUDINARY_CLOUD_NAME=xxx
CLOUDINARY_API_KEY=xxx
CLOUDINARY_API_SECRET=xxx
```
---

## 五、脚本结构要求

```plaintext
require('dotenv').config();
const cloudinary = require('cloudinary').v2;
const { createClient } = require('@supabase/supabase-js');

// 初始化 Supabase 和 Cloudinary
// ...

// 检查 URL 是否可访问的函数
async function checkUrlExists(url) {
  // 用 HEAD 请求检查，返回 true/false
}

// 生成合法打乱顺序的函数
function generateShuffledMoves(gridSize) {
  // 从目标状态开始，执行 gridSize^2 * 50 次合法随机移动
  // 返回一维数组表示的排列顺序
}

// 主函数
async function importPuzzles() {
  const puzzles = require('./seed-puzzles.json');
  
  for (const item of puzzles) {
    try {
      // 1. 检查是否已存在（按 name）
      // 2. 上传 Cloudinary
      // 3. 检查碎片封面是否存在，不存在则生成
      // 4. 生成 moves
      // 5. 插入 Supabase
      console.log('导入成功:', item.name, data.id);
    } catch (err) {
      console.error('导入失败:', item.name, err.message);
    }
  }
  
  console.log('导入完成');
  process.exit(0);
}

importPuzzles();
```
---

## 六、对齐检查要求

在生成代码之前，请先完成以下检查：

1.  **逐字段列出** `**puzzles**`**表的所有字段**
    
2.  **逐字段说明脚本 insert 时会填什么值、值从哪里来**
    
3.  **明确指出哪些字段是表里有但脚本不填的**（如果有），并说明原因
    
4.  **确认** `**hidden_index**`**的取值范围是** `**0 ~ gridSize*gridSize - 1**`
    
5.  **确认** `**moves**`**字段的 JSON 格式与现有代码兼容**
    

只有在以上检查完成后，再生成最终的脚本代码。

---

## 七、期望输出

生成两个文件：

1.  `**scripts/seed-puzzles.json**`：示例配置文件（包含 2-3 条示例数据）
    
2.  `**scripts/import-puzzles.js**`：导入脚本
    

确保脚本可以直接通过 `node scripts/import-puzzles.js`运行，不需要额外的手动修改。