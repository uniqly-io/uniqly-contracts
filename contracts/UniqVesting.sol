// SPDX-License-Identifier: MIT
pragma solidity 0.8.2;

// Presale and good ERC20 contracts interaction interface
abstract contract IContracts {
    function balanceOf(address) external virtual returns (uint256);

    function transfer(address, uint256) external virtual returns (bool);
}

// Broken ERC20 transfer for rescue ERC20 tokens
abstract contract IErc20 {
    function balanceOf(address) external virtual returns (uint256);

    // some tokens (like USDT) not return bool as standard require
    function transfer(address, uint256) external virtual;
}

/// @title Uniqly vesting contract
/// @author rav3n_pl
contract UniqVesting {
    // user is eligible to receive bonus NTF tokens (default=0)
    mapping(address => uint256) internal _bonusNft;

    /// it will be used by future contract
    function bonusNft(address user) external view returns (uint256) {
        return _bonusNft[user];
    }

    // user has counted tokens from presale contract/s (default=false)
    mapping(address => bool) internal _initialized;

    function initialized(address user) external view returns (bool) {
        return _initialized[user];
    }

    // total amount of token bought by presale contracts (default=0)
    mapping(address => uint256) internal _tokensTotal;

    function tokensTotal(address user) external view returns (uint256) {
        return _tokensTotal[user];
    }

    // percentage already withdrawn by user (default=0)
    mapping(address => uint256) internal _pctWithdrawn;

    function pctWithdrawn(address user) external view returns (uint256) {
        return _pctWithdrawn[user];
    }

    /// ERC20 token contract address
    address public immutable token;

    address[] internal _presales;

    /// set of addresses of presale contracts
    function presales(uint256 num) external view returns (address) {
        return _presales[num];
    }

    uint256[] internal _rates;

    /// rates ETH/token for each contract
    function rates(uint256 num) external view returns (uint256) {
        return _rates[num];
    }

    /// timestamp that users can start withdrawals
    uint256 public immutable dateStart;
    /// address of contract owner
    address public owner;

    /**
    @dev contract constructor
    @param _token address of ERC20 token contract
    @param _presale address[] of collection contract addresses
    @param _rate uint256[] ETH/token conversion rate for each contract
    @param _dateStart uint256 timestamp from when users can start withdrawing tokens 
    */
    constructor(
        address _token,
        address[] memory _presale,
        uint256[] memory _rate,
        uint256 _dateStart
    ) {
        token = _token;
        _presales = _presale;
        _rates = _rate;
        dateStart = _dateStart;
        owner = msg.sender;
    }

    /**
    @dev user can call to calculate total tokens w/o taking them
    @return total number of tokens eligible to withdraw
    */
    function calc() external returns (uint256) {
        require(!_initialized[msg.sender], "Account already initialized");
        _init(msg.sender);
        return _tokensTotal[msg.sender];
    }

    /**
    @dev Number of tokens eligible to withdraw
    works only if user used calc() or claim() earlier
    @return number of tokens available for user
     */
    function balanceOf(address user) external view returns (uint256) {
        return _tokensTotal[user] * ((100 - _pctWithdrawn[user]) / 100);
    }

    // internal account init function checking and calculating amounts from contracts
    function _init(address user) internal {
        // for each presale contract
        for (uint256 i = 0; i < _presales.length; i++) {
            // count number of tokens
            _tokensTotal[user] +=
                IContracts(_presales[i]).balanceOf(user) *
                _rates[i];
        }
        // don't do this again
        _initialized[user] = true;
    }

    /**
    @dev user call this function to withdraw tokens
    @return bool true if any token transfer made
    */
    function claim() external returns (bool) {
        // can't work before timestamp
        require(block.timestamp > dateStart, "Initial vesting in progress");
        // check for token amount if need
        if (!_initialized[msg.sender]) {
            _init(msg.sender);
        }
        // initial percent is 20
        uint256 pct = 20;
        uint256 time = dateStart + 1 weeks;
        // every week to date
        while (time < block.timestamp) {
            pct += 4;
            // can't be more than 100
            if (pct == 100) {
                break;
            }
            time += 1 weeks;
        }
        // do we have any % of tokens to withdraw?
        if (pct > _pctWithdrawn[msg.sender]) {
            uint256 thisTime = pct - _pctWithdrawn[msg.sender];
            // is user a patient one?
            // you've got a prize/s in near future!
            if (thisTime >= 60) {
                _bonusNft[msg.sender] = 1;
                if (thisTime == 100) {
                    _bonusNft[msg.sender] = 2;
                }
            }
            // how many tokens it would be...
            uint256 amt = (_tokensTotal[msg.sender] * thisTime) / 100;
            // yes, no reentrance pls
            _pctWithdrawn[msg.sender] += thisTime;
            // transfer tokens counted
            return IContracts(token).transfer(msg.sender, amt);
        }
        // did nothing
        return false;
    }

    modifier onlyOwner {
        require(msg.sender == owner, "Only for Owner");
        _;
    }

    // change ownership in two steps to be sure about owner address
    address public newOwner;

    // only current owner can delegate new one
    function giveOwnership(address _newOwner) external {
        require(msg.sender == owner, "Only for Owner");
        newOwner = _newOwner;
    }

    // new owner need to accept ownership
    function acceptOwnership() external {
        require(msg.sender == newOwner, "Ure not New Owner");
        newOwner = address(0);
        owner = msg.sender;
    }

    /**
    @dev Add investor to vesting contract that not used collection contract
    @param addr - address to add
    @param amount - tokens due
    */
    function addInvestor(address addr, uint256 amount) external onlyOwner {
        _addInvestor(addr, amount);
    }

    /**
    @dev Add investors in bulk
    @param addr table of addresses
    @param amount table of amounts
    */
    function addInvestors(address[] calldata addr, uint256[] calldata amount)
        external
        onlyOwner
    {
        require(addr.length == amount.length, "Data length not math");
        for (uint256 i = 0; i < addr.length; i++) {
            _addInvestor(addr[i], amount[i]);
        }
    }

    // internal function adding investors
    function _addInvestor(address addr, uint256 amt) internal {
        require(_tokensTotal[addr] == 0, "Address already on list");
        _tokensTotal[addr] = amt;
    }

    /**
    @dev Function to recover accidentally send ERC20 tokens
    @param _token ERC20 token address
    */
    function rescueERC20(address _token) external onlyOwner {
        uint256 amt = IErc20(_token).balanceOf(address(this));
        require(amt > 0, "Nothing to rescue");
        IErc20(_token).transfer(owner, amt);
    }
}
