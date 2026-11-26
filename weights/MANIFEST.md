# Model files

The server decides its mode at start-up from the files in this folder (`twin/engine.py`). With no `model_select.json` here, it serves **DAP**.

| File | What it is | Made by | SHA-256 |
|---|---|---|---|
| `climatology.npz` | `clim` [366, 6, 32, 36]: smoothed daily climatology, training years 2005–2017 | `python -m training.fit_dap` | `3ca969f47469e51659b6552dd4f4360908fe48fa570f0a8bb816e1c930dbb83d` |
| `dap.npz` | `phi` [6, 32, 36]: damping coefficient per channel and cell, 2005–2017 | `python -m training.fit_dap` | `9269ee9c69ec36e8dedade14d6baabcdc727ea02413d555c4a7aae114fb412ad` |
| `static.npz` | `static` [2, 32, 36]: land–sea mask and orography from the organisers' dataset | `python -m training.localnet_data` | `dd2f5647825affa7daa71dd9dd933235bba0f44b89176ed7f0edad277f7cc248` |
| `norm.json` | Normalisation statistics for LocalNet. **Not used by DAP** | `python -m training.localnet_data` | `e20e389f10ae59ed26fa1d62457b9a6db2c4182fe97ebc7bf1630473f85c1bce` |
| `stats.json` | The organisers' per-channel mean and standard deviation, copied unchanged | organisers | `f00103a38a93dcbaea4e4bd31da3db6862812cd2807bd2224c51264054e014a7` |

Dataset: `india_climate_train.nc`, SHA-256 `f37bdbd0bd44e6fe951adf36c9a08620075f9d17de391b04c97d61f06797903b` (matches the organisers' `SHA256SUMS.txt`). It is not in the repository.

**Split:** training 2005–2017, validation 2018–2019, test 2020–2021 (not used).

**Validation results:** `eval/reports/dap_validation.json/` and `eval/reports/dap_shocks.json/`. These are local measurements by one team member on frozen windows, not the competition score. The model reports itself as `monsoontwin-dap-unvalidated` because no second person has re-run them.

**Known limitation:** DAP forecasts each grid cell separately, so a shock cannot spread outside the cells it was applied to.
