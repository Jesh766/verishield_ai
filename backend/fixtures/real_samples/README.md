# Drop-in folder for your own document images

Put your real sample captures here (`.jpg` / `.png`). They are gitignored and
never committed.

Naming convention so the test helper can pick them up automatically:

```
aadhaar_<anything>.jpg
passport_<anything>.jpg
dl_<anything>.jpg
```

Run them through the pipeline with:

```bash
python fixtures/try_sample.py fixtures/real_samples/aadhaar_mine.jpg aadhaar
```

Note: nothing in this folder is uploaded anywhere. OCR runs locally.
