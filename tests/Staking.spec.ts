import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, Dictionary, beginCell, toNano } from '@ton/core';
import { StakingMaster } from '../wrappers/StakingMaster';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';
import { randomAddress } from '@ton/test-utils';
import { JettonMinter } from '../wrappers/JettonMinter';
import { NFTCollection } from '../wrappers/NFTCollection';

describe('Staking', () => {
    let codeMaster: Cell;
    let codeHelper: Cell;
    let codeJettonMinter: Cell;
    let codeJettonWallet: Cell;
    let codeNFTCollection: Cell;
    let codeNFTItem: Cell;

    beforeAll(async () => {
        codeMaster = await compile('StakingMaster');
        codeHelper = await compile('StakingHelper');
        codeJettonMinter = await compile('JettonMinter');
        codeJettonWallet = await compile('JettonWallet');
        codeNFTCollection = await compile('NFTCollection');
        codeNFTItem = await compile('NFTItem');
    });

    let blockchain: Blockchain;
    let stakingMaster: SandboxContract<StakingMaster>;
    let jettonMinter: SandboxContract<JettonMinter>;
    let collection: SandboxContract<NFTCollection>;
    let users: SandboxContract<TreasuryContract>[];

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        blockchain.now = 1600000000;

        users = await blockchain.createWallets(5);

        // deploy jetton minter
        jettonMinter = blockchain.openContract(
            JettonMinter.createFromConfig(
                {
                    admin: users[0].address,
                    content: Cell.EMPTY,
                    walletCode: codeJettonWallet,
                },
                codeJettonMinter
            )
        );
        await jettonMinter.sendDeploy(users[0].getSender(), toNano('0.05'));

        // deploy collection
        collection = blockchain.openContract(
            NFTCollection.createFromConfig(
                {
                    owner: users[0].address,
                    collectionContent: Cell.EMPTY,
                    commonContent: Cell.EMPTY,
                    itemCode: codeNFTItem,
                    royaltyBase: 100n,
                    royaltyFactor: 100n,
                },
                codeNFTCollection
            )
        );
        await collection.sendDeploy(users[0].getSender(), toNano('0.05'));

        // deploy some items and add them to dictionary
        let items = Dictionary.empty(Dictionary.Keys.Address(), Dictionary.Values.BigVarUint(4));
        for (let i = 0; i < 4; i++) {
            const item = (await collection.sendMint(users[0].getSender(), toNano('0.05'))).result;
            items = items.set(item.address, toNano('1') * BigInt(i + 1));
        }

        stakingMaster = blockchain.openContract(
            StakingMaster.createFromConfig(
                {
                    items,
                    jettonMaster: jettonMinter.address,
                    jettonWalletCode: codeJettonWallet,
                    helperCode: codeHelper,
                },
                codeMaster
            )
        );

        const deployResult = await stakingMaster.sendDeploy(users[0].getSender(), toNano('0.05'));

        expect(deployResult.transactions).toHaveTransaction({
            from: users[0].address,
            to: stakingMaster.address,
            deploy: true,
            success: true,
        });
    });

    it('should deploy', async () => {
        // the check is done inside beforeEach
        // blockchain and stakingMaster are ready to use
    });

    it('should stake items', async () => {
        {
            const item = blockchain.openContract(await collection.getNftItemByIndex(0n));

            const result = await item.sendTransfer(
                users[0].getSender(),
                toNano('0.2'),
                stakingMaster.address,
                beginCell().storeUint(0x429c67c7, 32).storeUint(7, 8).endCell()
            );

            expect(result.transactions).toHaveTransaction({
                on: stakingMaster.address,
                success: true,
            });
            const helper = blockchain.openContract(await stakingMaster.getHelper(item.address));
            expect(result.transactions).toHaveTransaction({
                from: stakingMaster.address,
                to: helper.address,
                success: true,
                deploy: true,
            });
            expect(await helper.getStaker()).toEqualAddress(users[0].address);
            expect(await helper.getStakedAt()).toEqual(1600000000n);
            expect(await helper.getOption()).toEqual(7);
        }

        {
            const item = blockchain.openContract(await collection.getNftItemByIndex(1n));
            await item.sendTransfer(users[0].getSender(), toNano('0.2'), users[1].address);

            const result = await item.sendTransfer(
                users[1].getSender(),
                toNano('0.2'),
                stakingMaster.address,
                beginCell().storeUint(0x429c67c7, 32).storeUint(30, 8).endCell()
            );

            expect(result.transactions).toHaveTransaction({
                on: stakingMaster.address,
                success: true,
            });
            const helper = blockchain.openContract(await stakingMaster.getHelper(item.address));
            expect(result.transactions).toHaveTransaction({
                from: stakingMaster.address,
                to: helper.address,
                success: true,
                deploy: true,
            });
            expect(await helper.getStaker()).toEqualAddress(users[1].address);
            expect(await helper.getStakedAt()).toEqual(1600000000n);
            expect(await helper.getOption()).toEqual(30);
        }
    });
});
