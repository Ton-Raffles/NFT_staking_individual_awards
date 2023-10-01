import { Blockchain, SandboxContract, TreasuryContract, printTransactionFees } from '@ton/sandbox';
import { Cell, Dictionary, beginCell, toNano } from '@ton/core';
import { StakingMaster } from '../wrappers/StakingMaster';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';
import { JettonMinter } from '../wrappers/JettonMinter';
import { NFTCollection } from '../wrappers/NFTCollection';
import { JettonWallet } from '../wrappers/JettonWallet';

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
        for (let i = 0; i < 2; i++) {
            const item = (await collection.sendMint(users[0].getSender(), toNano('0.05'), i)).result;
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

        // mint some jettons to staking master
        await jettonMinter.sendMint(
            users[0].getSender(),
            toNano('0.05'),
            toNano('0.1'),
            stakingMaster.address,
            toNano('1000')
        );
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
            expect(await helper.getStakedAt()).toEqual(1600000000);
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
            expect(await helper.getStakedAt()).toEqual(1600000000);
            expect(await helper.getOption()).toEqual(30);
        }
    });

    it('should not stake items not from dict', async () => {
        const item = blockchain.openContract(
            (await collection.sendMint(users[0].getSender(), toNano('0.05'), 2)).result
        );

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
        expect(result.transactions).not.toHaveTransaction({
            from: stakingMaster.address,
            to: helper.address,
            success: true,
            deploy: true,
        });
        expect(await item.getOwner()).toEqualAddress(users[0].address);
    });

    it('should not stake with wrong option', async () => {
        const item = blockchain.openContract(await collection.getNftItemByIndex(0n));

        const result = await item.sendTransfer(
            users[0].getSender(),
            toNano('0.2'),
            stakingMaster.address,
            beginCell().storeUint(0x429c67c7, 32).storeUint(123, 8).endCell()
        );

        expect(result.transactions).toHaveTransaction({
            on: stakingMaster.address,
            success: true,
        });
        const helper = blockchain.openContract(await stakingMaster.getHelper(item.address));
        expect(result.transactions).not.toHaveTransaction({
            from: stakingMaster.address,
            to: helper.address,
            success: true,
            deploy: true,
        });
        expect(await item.getOwner()).toEqualAddress(users[0].address);
    });

    it('should claim rewards', async () => {
        {
            const item = blockchain.openContract(await collection.getNftItemByIndex(0n));
            await item.sendTransfer(
                users[0].getSender(),
                toNano('0.2'),
                stakingMaster.address,
                beginCell().storeUint(0x429c67c7, 32).storeUint(7, 8).endCell()
            );
            const helper = blockchain.openContract(await stakingMaster.getHelper(item.address));
            expect(await helper.getStakedAt()).toEqual(1600000000);
            expect(await helper.getOption()).toEqual(7);

            blockchain.now = 1600000000 + 86400 * 7;

            const result = await helper.sendClaim(users[0].getSender(), toNano('0.2'), 123n, true);
            expect(result.transactions).toHaveTransaction({
                on: stakingMaster.address,
                success: true,
            });
            expect(await item.getOwner()).toEqualAddress(users[0].address);
            expect(
                await blockchain
                    .openContract(
                        JettonWallet.createFromAddress(await jettonMinter.getWalletAddressOf(users[0].address))
                    )
                    .getJettonBalance()
            ).toEqual(toNano('7'));
        }

        {
            const item = blockchain.openContract(await collection.getNftItemByIndex(0n));
            await item.sendTransfer(
                users[0].getSender(),
                toNano('0.2'),
                stakingMaster.address,
                beginCell().storeUint(0x429c67c7, 32).storeUint(14, 8).endCell()
            );
            const helper = blockchain.openContract(await stakingMaster.getHelper(item.address));
            expect(await helper.getStakedAt()).toEqual(1600000000 + 86400 * 7);
            expect(await helper.getOption()).toEqual(14);

            blockchain.now = 1600000000 + 86400 * (7 + 14);

            const result = await helper.sendClaim(users[0].getSender(), toNano('0.2'), 123n, true);
            expect(result.transactions).toHaveTransaction({
                on: stakingMaster.address,
                success: true,
            });
            expect(await item.getOwner()).toEqualAddress(users[0].address);
            expect(
                await blockchain
                    .openContract(
                        JettonWallet.createFromAddress(await jettonMinter.getWalletAddressOf(users[0].address))
                    )
                    .getJettonBalance()
            ).toEqual(toNano('21'));

            expect(await helper.getStakedAt()).toEqual(0);
        }

        {
            const item = blockchain.openContract(await collection.getNftItemByIndex(1n));
            await item.sendTransfer(
                users[0].getSender(),
                toNano('0.2'),
                stakingMaster.address,
                beginCell().storeUint(0x429c67c7, 32).storeUint(7, 8).endCell()
            );
            const helper = blockchain.openContract(await stakingMaster.getHelper(item.address));
            expect(await helper.getStakedAt()).toEqual(1600000000 + 86400 * (7 + 14));
            expect(await helper.getOption()).toEqual(7);

            blockchain.now = 1600000000 + 86400 * (7 + 14 + 7);

            const result = await helper.sendClaim(users[0].getSender(), toNano('0.2'), 123n, true);
            expect(result.transactions).toHaveTransaction({
                on: stakingMaster.address,
                success: true,
            });
            expect(await item.getOwner()).toEqualAddress(users[0].address);
            expect(
                await blockchain
                    .openContract(
                        JettonWallet.createFromAddress(await jettonMinter.getWalletAddressOf(users[0].address))
                    )
                    .getJettonBalance()
            ).toEqual(toNano('35'));

            expect(await helper.getStakedAt()).toEqual(0);
        }
    });

    it('should not claim until time passes', async () => {
        const item = blockchain.openContract(await collection.getNftItemByIndex(0n));
        await item.sendTransfer(
            users[0].getSender(),
            toNano('0.2'),
            stakingMaster.address,
            beginCell().storeUint(0x429c67c7, 32).storeUint(7, 8).endCell()
        );
        const helper = blockchain.openContract(await stakingMaster.getHelper(item.address));
        expect(await helper.getStakedAt()).toEqual(1600000000);
        expect(await helper.getOption()).toEqual(7);

        blockchain.now = 1600000000 + 86400 * 7 - 1;

        {
            const result = await helper.sendClaim(users[0].getSender(), toNano('0.2'), 123n, true);
            expect(result.transactions).toHaveTransaction({
                on: helper.address,
                exitCode: 703,
            });
        }

        blockchain.now = 1600000000 + 86400 * 7;

        {
            const result = await helper.sendClaim(users[0].getSender(), toNano('0.2'), 123n, true);
            expect(result.transactions).toHaveTransaction({
                on: stakingMaster.address,
                success: true,
            });
            expect(await item.getOwner()).toEqualAddress(users[0].address);
            expect(
                await blockchain
                    .openContract(
                        JettonWallet.createFromAddress(await jettonMinter.getWalletAddressOf(users[0].address))
                    )
                    .getJettonBalance()
            ).toEqual(toNano('7'));
        }
    });

    it('should not claim twice', async () => {
        const item = blockchain.openContract(await collection.getNftItemByIndex(0n));
        await item.sendTransfer(
            users[0].getSender(),
            toNano('0.2'),
            stakingMaster.address,
            beginCell().storeUint(0x429c67c7, 32).storeUint(7, 8).endCell()
        );
        const helper = blockchain.openContract(await stakingMaster.getHelper(item.address));
        expect(await helper.getStakedAt()).toEqual(1600000000);
        expect(await helper.getOption()).toEqual(7);

        blockchain.now = 1600000000 + 86400 * 7;

        {
            const result = await helper.sendClaim(users[0].getSender(), toNano('0.2'), 123n, true);
            expect(result.transactions).toHaveTransaction({
                on: stakingMaster.address,
                success: true,
            });
            expect(await item.getOwner()).toEqualAddress(users[0].address);
            expect(
                await blockchain
                    .openContract(
                        JettonWallet.createFromAddress(await jettonMinter.getWalletAddressOf(users[0].address))
                    )
                    .getJettonBalance()
            ).toEqual(toNano('7'));
        }

        {
            const result = await helper.sendClaim(users[0].getSender(), toNano('0.2'), 123n, true);
            expect(result.transactions).toHaveTransaction({
                on: helper.address,
                success: false,
            });
        }
    });
});
