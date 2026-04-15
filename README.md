# privy-next-wagmi-gas-sponsor

一个最简化、可直接迁移使用的 `Privy 7702 + Backend Sponsor` 多链项目。

当前支持的核心能力：

- 前端按链选择 `EIP-7702 authorization`
- 后端按链选择 sponsor/operator 钱包补签并广播 type-4 交易
- 每条 EVM 链都可以独立部署 `ERC1967Factory / PrivyAdmin / PrivyLogical`
- 支持单链部署和批量部署
- 新增一条 EVM 链时，只需要补一条链配置 + 一个链专属 env 文件

## 目录

- 前端 + 后端：`src/app/page.tsx:1`
- 7702 组件：`src/components/sections/privy-erc20-transfer-7702.tsx:1`
- Sponsor API：`src/app/api/privy-erc20-transfer-7702/route.ts:1`
- 运行时链配置：`src/generated/gas-sponsor-chains.json:1`
- 链注册表：`config/gas-sponsor-chains.json:1`
- 单链部署脚本：`scripts/deploy-privy-chain.sh:1`
- 批量部署脚本：`scripts/deploy-privy-batch.sh:1`
- 配置同步脚本：`scripts/sync-gas-sponsor-chains.mjs:1`

## 多链配置模型

### 1. 链注册表

在 `config/gas-sponsor-chains.json` 里维护所有准备支持的链，例如：

```json
[
  {
    "key": "bsc-testnet",
    "id": 97,
    "name": "BSC Testnet",
    "rpcUrl": "https://bsc-testnet.bnbchain.org",
    "blockExplorerUrl": "https://testnet.bscscan.com",
    "nativeCurrency": {
      "name": "BNB",
      "symbol": "tBNB",
      "decimals": 18
    },
    "contractsEnvFile": "contracts/.env.bsc-testnet",
    "defaults": {
      "sponsoredTokenAddress": "0x741022f045Bbe7d020ebEdbB376743B63fea28e6",
      "sponsoredTransferToAddress": "0x0812aba96cd9a62b38c30e33020b1a76017d9ba1"
    }
  }
]
```

### 2. 每条链一个部署 env

复制模板：

```bash
cp contracts/.env.example contracts/.env.bsc-testnet
```

再按链填写：

- `RPC_URL`
- `CHAIN_ID`
- `PRIVATE_KEY`
- `SPONSOR_PRIVATE_KEY`
- `OPERATORS_ADDRESSES`

部署后脚本会自动回填：

- `FACTORY_ADDRESS`
- `PRIVY_ADMIN_PROXY_ADDRESS`
- `PRIVY_ADMIN_IMPLEMENTATION_ADDRESS`
- `PRIVY_LOGICAL_ADDRESS`

### 3. 根目录 `.env`

根目录 `.env` 只需要放 Privy 服务端配置，以及可选的默认链设置：

- `NEXT_PUBLIC_PRIVY_APP_ID`
- `PRIVY_APP_SECRET`
- `NEXT_PUBLIC_DEFAULT_GAS_SPONSOR_CHAIN_KEY`

如果你希望后端显式按链读取 sponsor key，也可以写成：

- `SPONSOR_PRIVATE_KEY__BSC_TESTNET=0x...`
- `SPONSOR_PRIVATE_KEY__SEPOLIA_TESTNET=0x...`
- `SPONSOR_PRIVATE_KEY__ARBITRUM_TESTNET=0x...`

部署/同步脚本也会自动把链 env 里的 sponsor key 回填成这种格式。

## 启动前

1. 复制根环境文件：

```bash
cp .env.example .env
```

2. 为每条链复制一个合约环境文件：

```bash
cp contracts/.env.example contracts/.env.bsc-testnet
```

3. 填写必要变量。

## 新增一条 EVM 链

以 `sepolia-testnet` 为例：

1. 在 `config/gas-sponsor-chains.json` 增加一条链配置
2. 新建 `contracts/.env.sepolia-testnet`
3. 填好 `RPC_URL / CHAIN_ID / PRIVATE_KEY / SPONSOR_PRIVATE_KEY`
4. 运行：

```bash
pnpm deploy:chain -- --chain sepolia-testnet --redeploy-logical
```

部署完成后会自动：

- 部署或复用 `ERC1967Factory`
- 部署或复用 `PrivyAdmin proxy`
- 注册 sponsor/operator
- 部署 `PrivyLogical`
- 生成 `src/generated/gas-sponsor-chains.json`
- 更新根目录 `.env` 的默认链和 sponsor key 映射

## 单链部署

```bash
pnpm deploy:chain -- --chain bsc-testnet --redeploy-logical
```

兼容旧命令：

```bash
pnpm deploy:bsc-testnet -- --redeploy-logical
```

## 批量部署

部署指定链：

```bash
pnpm deploy:batch -- --chains bsc-testnet,sepolia-testnet,arbitrum-testnet --redeploy-logical
```

部署注册表里的全部链：

```bash
pnpm deploy:batch -- --all --redeploy-logical
```

## 仅同步链配置

当你手动改了 `contracts/.env.<chain-key>`，可以只重新生成前后端运行时链配置：

```bash
pnpm sync:chains
```

## Flutter raw-hash migration helper

新增 `src/lib/privy-7702-flutter.ts`，用于把 React 里的 `useSign7702Authorization()` 流程改造成 Flutter 可迁移版本：

- `hash7702AuthorizationForFlutter(...)`
  - 生成 EIP-7702 digest
- `buildFlutter7702RawHashRequest(...)`
  - 生成给 Flutter `provider.request(...)` 的 `secp256k1_sign` 请求
- `toSigned7702Authorization(...)`
  - 把 raw signature 转成后端现有 API 所需的 `{ address, chainId, nonce, r, s, yParity }`
- `buildFlutter7702RpcRequest(...)`
  - 保留一个直接走 `eth_sign7702Authorization` 的请求结构，方便对照/探针

迁移时，Flutter 只需要按同样字段把 `authorization` 传给 `/api/privy-erc20-transfer-7702` 即可。

## 启动应用

```bash
pnpm install
pnpm sync:chains
pnpm dev
```

## 默认演示参数

- 默认链：`bsc-testnet`
- 默认 Token: `0x741022f045Bbe7d020ebEdbB376743B63fea28e6`
- 默认 Recipient: `0x0812aba96cd9a62b38c30e33020b1a76017d9ba1`
