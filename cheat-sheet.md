# Ethereum Yellow Paper Cheat Sheet
by @pldespaigne


by [𝕏 @pldespaigne](https://twitter.com/pldespaigne)

## $σ$ - World State (sigma)
The list of every accounts stored in the blockchain
- $σ[a]$ the account with address $a$
  - $σ[a]_n$ **n**once
  - $σ[a]_b$ **b**alance
  - $σ[a]_s$ **s**torage
    - $σ[a]_s[k]$ value stored in slot $k$
  - $σ[a]_c$ **c**ode

## $T$ - Transaction
- $T$ an Ethereum **t**ransaction
  - $T_x$ transaction **t**ype: 0 for legacy, 1 for EIP-2930, 2 for EIP-1559
  - $T_n$ **n**once
  - $T_g$ **g**as limit
  - $T_t$ "**t**o" *(recipient)* address
  - $T_A$ **a**ccess list *(only for type 1 & 2)*
    - $E$ one item of the access list
      - $E_a$ **a**ddress
      - $E_s$ list **s**torage keys
  - $T_c$ **c**hain id
  - $T_m$ **m**ax fee per gas *(only for type 2)*
  - $T_f$ max priority **f**ee per gas *(only for type 1 & 2)*
  - $T_p$ gas **p**rice *(only for type 0)*
  - $T_i$ deploy *(**i**nit)* bytecode for contract creation
  - $T_d$ call **d**ata for regular transaction
- $S(T)$ the sender address of the transaction $T$

## $H$ - Block Header
- $H$ an Ethereum **b**lock header
  - $H_p$ the block's **p**arent hash
  - $H_c$ the fee recipient and block reward address *(**c**oinbase)*
  - $H_i$ the block number
  - $H_l$ the block gas **l**imit
  - $H_g$ total **g**as used in the block
  - $H_s$ time**s**tamp
  - $H_a$ latest beacon chain RANDAO value
  - $H_f$ base **f**ee per gas
- $P(H)$ the **p**arent block of the current header $H$

## $A$ - Execution Sub-State
- $A$ the "**a**ccrued sub-state" accumulate info during the whole transaction execution
  - $A_s$ list of **s**elf-destructed addresses
  - $A_l$ emitted **l**ogs
  - $A_t$ list of "**t**ouched" addresses, if it contains "empty" accounts, those will be deleted
  - $A_r$ **r**efund balance
  - $A_a$ **a**ccessed *(warm)* addresses *(initialized with the precompiled addresses)*
  - $A_K$ warm storage **k**eys, it's an array of addresses & storage keys

## $I$ - Execution Environment
- $I$ store constant info only from the current call
  - $I_a$ **a**ddress of the current account executing
  - $I_o$ **o**riginal sender address of the transaction
  - $I_p$ effective gas **p**rice to be paid in wei
  - $I_d$ the call **d**ata
  - $I_s$ the address of the code currently executing
  - $I_v$ the call transferred eth value in wei
  - $I_b$ the **b**yte code currently executing
  - $I_H$ the current pending block **h**eader
  - $I_e$ the current d**e**pth of the call stack
  - $I_w$ the allo**w** modification boolean flag

## $µ$ - EVM State (mu)
- $µ$ the current low-level state of the EVM
  - $µ_g$ remaining **g**as for this call
  - $µ_{pc}$ the **p**rogram **c**ounter
  - $µ_m$ the EVM **m**emory
  - $µ_i$ the "word-size" of the memory *(a word is 32 bytes)*
  - $µ_s$ the EVM **s**tack