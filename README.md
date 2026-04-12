# privy-next-wagmi-gas-sponsor

一个最简化、可直接迁移使用的 `Privy 7702 + Backend Sponsor` 项目。

只保留一条已经验证可用的流程：

- 前端用 Privy 做 `EIP-7702 authorization`
- 前端用 Privy 做用户签名
- 后端用 sponsor/operator 钱包补签并广播 type-4 交易
- 当前业务动作固定为 `ERC-20 transfer`

## 目录

- 前端 + 后端：`src/app/page.tsx:1`
- 7702 组件：`src/components/sections/privy-erc20-transfer-7702.tsx:1`
- Sponsor API：`src/app/api/privy-erc20-transfer-7702/route.ts:1`
- 合约目录：`contracts/foundry.toml:1`
- 一键部署脚本：`scripts/deploy-bsc-testnet-privy.sh:1`
- 环境同步脚本：`scripts/sync-bsc-testnet-env.mjs:1`
- 流程文档：`docs/PRIVY_7702_BACKEND_SPONSOR_FLOW.md:1`

## 启动前

1. 复制根环境文件：

```bash
cp .env.example .env
```

2. 复制合约环境文件：

```bash
cp contracts/.env.example contracts/.env
```

3. 填写：

- `NEXT_PUBLIC_PRIVY_APP_ID`
- `PRIVY_APP_SECRET`
- `PRIVATE_KEY`
- `SPONSOR_PRIVATE_KEY`

## 一键部署 BSC Testnet

```bash
bash scripts/deploy-bsc-testnet-privy.sh --redeploy-logical
```

部署完成后脚本会自动：

- 部署/复用 `ERC1967Factory`
- 部署/复用 `PrivyAdmin proxy`
- 注册 operator
- 部署新的 `PrivyLogical`（如果 salt 已占用会自动追加时间后缀）
- 回填 `contracts/.env`
- 自动同步根目录 `.env`

## 启动应用

```bash
pnpm install
pnpm dev
```

## 默认演示参数

- Token: `0x741022f045Bbe7d020ebEdbB376743B63fea28e6`
- Recipient: `0x0812aba96cd9a62b38c30e33020b1a76017d9ba1`
- Chain: `BSC Testnet (97)`
