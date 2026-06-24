## 1. 修改 LabelService

- [x] 1.1 修改 createLabel 方法，接收 userId 参数并设置 updateBy 字段
- [x] 1.2 修改 updateLabel 方法，接收 userId 参数并设置 updateBy 字段

## 2. 修改 LabelController

- [x] 2.1 修改 createLabel 方法，添加 x-user-id 请求头参数
- [x] 2.2 修改 updateLabel 方法，添加 x-user-id 请求头参数
- [x] 2.3 将 userId 传递给 LabelService 的对应方法

## 3. 验证测试

- [ ] 3.1 测试新增标签时 updateAt 和 updateBy 是否正确设置
- [ ] 3.2 测试更新标签时 updateAt 和 updateBy 是否正确更新