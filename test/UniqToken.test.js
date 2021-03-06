const { expect } = require('chai');
const { accounts, contract } = require('@openzeppelin/test-environment');
const {
    BN,           // Big Number support
    constants,    // Common constants, like the zero address and largest integers
    expectEvent,  // Assertions for emitted events
} = require('@openzeppelin/test-helpers');

const { ZERO_ADDRESS } = constants;

const UniqToken = contract.fromArtifact('UniqToken');
const usdToken = contract.fromArtifact('TetherToken');

describe('UniqToken', function () {
    const [owner, minter, recipient, anotherAccount] = accounts;

    const name = 'Uniqly';
    const symbol = 'UNIQ';

    const tentho = new BN(10000);
    const hundred = new BN(100);
    const ten = new BN(10);

    before(async function () {
        this.token = await UniqToken.new(tentho, { from: owner });
    });

    it('has a name', async function () {
        expect(await this.token.name()).to.equal(name);
    });

    it('has a symbol', async function () {
        expect(await this.token.symbol()).to.equal(symbol);
    });

    it('has 18 decimals', async function () {
        expect(await this.token.decimals()).to.be.bignumber.equal(new BN(18));
    });

    it('has 10000 initial balance', async function () {
        expect(await this.token.totalSupply()).to.be.bignumber.equal(tentho);
    });

    it('a publisher is owner', async function () {
        expect(await this.token.owner()).to.be.equal(owner)
    });

    describe('Transfer', function () {
        it('an owner transfers to recipient', async function () {
            expectEvent(await this.token.transfer(recipient, hundred, { from: owner }),
                'Transfer', {
                from: owner,
                to: recipient,
                value: hundred,
            });
        });
        it('a sender has a proper balance', async function () {
            expect(await this.token.balanceOf(owner)).to.be.bignumber.equal(new BN(tentho - hundred));
        })

        it('a recipient has a proper balance after transfer', async function () {
            expect(await this.token.balanceOf(recipient)).to.be.bignumber.equal(hundred);
        });
    });

    describe('Burn', function () {
        it('an owner burns tokens', async function () {
            expectEvent(await this.token.burn(hundred, { from: owner }),
                'Transfer', {
                from: owner,
                to: ZERO_ADDRESS,
                value: hundred,
            })
        })
        it('total supply changed', async function () {
            expect(await this.token.totalSupply()).to.be.bignumber.equal(new BN(tentho - hundred));
        })
    });

    describe('Approve/allowance', function () {
        it('set allowance', async function () {
            expectEvent(await this.token.approve(minter, hundred, { from: owner }),
                'Approval', {
                owner: owner,
                spender: minter,
                value: hundred,
            })
        });
        it('Use TransferFrom', async function () {
            let twoEvents = await this.token.transferFrom(owner, anotherAccount, ten, { from: minter });
            expectEvent(twoEvents, 'Transfer', {
                from: owner,
                to: anotherAccount,
                value: ten,
            });
            expectEvent(twoEvents, 'Approval', {
                owner: owner,
                spender: minter,
                value: new BN(90),
            });
        });
        it('Use burnFrom', async function () {
            let twoEvents = await this.token.burnFrom(owner, ten, { from: minter });
            expectEvent(twoEvents, 'Transfer', {
                from: owner,
                to: ZERO_ADDRESS,
                value: ten,
            });
            expectEvent(twoEvents, 'Approval', {
                owner: owner,
                spender: minter,
                value: new BN(80),
            });
            expect(await this.token.totalSupply()).to.be.bignumber.equal(new BN(tentho - hundred - ten))
        });
    });

    describe('rescueERC20: Rouge token withdrawal', function () {
        let _initialSupply = tentho;
        let _name = 'USDToken';
        let _symbol = 'USDT';
        let _decimals = ten;

        it('deploy rouge token contract', async function () {
            // send usdt to contract address
            this.usdt = await usdToken.new(_initialSupply, _name, _symbol, _decimals, { from: minter });
        })
        it('transfer rouge tokens', async function () {
            expectEvent(await this.usdt.transfer(this.token.address, ten, { from: minter }),
                'Transfer', {
                from: minter,
                to: this.token.address,
                value: ten,
            })
            expect(await this.usdt.balanceOf(this.token.address)).to.be.bignumber.equal(ten);
        })
        it('Rescue tokens', async function () {
            // take usdt from contract to owner
            expectEvent(await this.token.rescueERC20(this.usdt.address, { from: owner }),
                'Transfer', {
                from: this.token.address,
                to: owner,
                value: ten,
            })
        })
    })

    describe('Change ownership', function () {
        it('Owner delegates Minter', async function () {
            await this.token.giveOwnership(minter, { from: owner })
        })
        it('Minter accepts', async function () {
            await this.token.acceptOwnership({ from: minter })
        })
        it('Minter is new Owner', async function () {
            expect(await this.token.owner()).to.equals(minter)
        })
    })

});
