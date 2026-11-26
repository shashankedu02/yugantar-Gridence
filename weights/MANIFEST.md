# Model files

The server decides its mode at start-up from the files in this folder (`twin/engine.py`). `model_select.json` selects **LocalNet C64**. DAP is the fallback and is loaded from the same folder.

**All files below belong to one training run** (`localnet_c64/run1`, seed 20261126). Do not replace one without the others: `tests/test_activated_package.py` fails if any is swapped.

| File | What it is | Used by | SHA-256 |
|---|---|---|---|
| `localnet.pt` | Residual CNN, 313,735 parameters (4 blocks, 64 channels). Holds its normalisation and static features | LocalNet | `7014c08477c2e9a6db4554280f6af5d8c07e7dc568faf494cfbcc5580caeedc9` |
| `model_select.json` | Names the checkpoint and its hash | start-up | not hash-checked (the same JSON as the run's file, with Unix line endings) |
| `climatology.npz` | `clim` [366, 6, 32, 36]: smoothed daily climatology, **2005–2015** | LocalNet and DAP | `e16bb7d65189c3d45007d0c033b7d16cd36fafc9db8cc23f248e2b63617415fd` |
| `dap.npz` | `phi` [6, 32, 36]: DAP damping coefficients, **2005–2015** | DAP fallback | `512a04649aec8295df3ba227da17621123402d93f8154c198783b00c01c81af8` |
| `provenance.json` | Training years and hashes of the two DAP files | record | |
| `norm.json` | Normalisation statistics, 2005–2015 (a record: the checkpoint carries the same values) | record, checks | `0af029f261de5985dafdbf358cf91d4bdaf63729cccafddae84c4b1b3f4a5aea` |
| `static.npz` | `static` [2, 32, 36]: land–sea mask and orography from the organisers' dataset | dashboard, checks | `dd2f5647825affa7daa71dd9dd933235bba0f44b89176ed7f0edad277f7cc248` |
| `stats.json` | The organisers' per-channel mean and standard deviation, copied unchanged | dashboard, scoring | `f00103a38a93dcbaea4e4bd31da3db6862812cd2807bd2224c51264054e014a7` |

The hashes of `localnet.pt`, `climatology.npz`, `norm.json`, `dap.npz` and `static.npz` are the ones the training run recorded (`eval/reports/activation/training_run_record.json`). That record also hashes the five source files used in training; they match this repository.

**Checked at activation:** `norm.json`, `climatology.npz` and the DAP coefficients are exactly reproduced from the 2005–2015 data; the checkpoint's stored normalisation and static features equal `norm.json` and `static.npz`. The network itself was not retrained, so a byte-identical retraining has **not** been shown.

**Data:** `india_climate_train.nc`, SHA-256 `f37bdbd0bd44e6fe951adf36c9a08620075f9d17de391b04c97d61f06797903b` (matches the organisers' `SHA256SUMS.txt`). It is not in the repository.

**Split:** network training 2005–2015; model choices on 2016–2017; frozen validation 2018–2019; test 2020–2021 **not used**.

**Validation results:** `eval/reports/activation/` (this package). Local measurements by one team member, **not independently reproduced** by a second person, and not the competition score. The server therefore names the model `monsoontwin-localnet-c64-unvalidated`.

**Known weaknesses** (details in the README): the monsoon-stall shock spreads in only 2 of 6 test windows; one warm-ocean test exceeds the stability limit; error at day 8 is worse than DAP's; rain is smoothed by day 8; not tested on Linux.

**Fallback:** if the checkpoint cannot be loaded, the server answers with DAP and reports `monsoontwin-dap-unvalidated`. A runtime error answers that whole request with DAP; a non-finite step is replaced by one DAP step. The response headers say which happened. The DAP pair (`climatology.npz`, `dap.npz`) is not hash-checked at start-up.

## Reverting to the earlier DAP model (fitted on 2005–2017)
It is in commit `5ec9b1c`:

```bash
git checkout 5ec9b1c -- weights/climatology.npz weights/dap.npz weights/norm.json weights/MANIFEST.md
git rm weights/localnet.pt weights/model_select.json weights/provenance.json
```
The README, brief, runbook and the browser tests' model name must then be reverted too (reverting the activation commit does all of this at once).
