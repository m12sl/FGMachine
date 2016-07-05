
import os
import json
import numpy as np

from sklearn.linear_model import LogisticRegression
from sklearn import datasets
from sklearn.preprocessing import StandardScaler

import argparse

digits = datasets.load_digits()

X, y = digits.data, digits.target
X = StandardScaler().fit_transform(X)

# classify small against large digits
y = (y > 4).astype(np.int)


# Parse arguments
parser = argparse.ArgumentParser(description='Calculate the LogisticRegression.')
parser.add_argument('--tempc', dest='tempc', type=float, default=0.1)
parser.add_argument('--penalty', dest='penalty', type=str, default='l1')
parser.add_argument('--_id', dest='_id', default=None)
params = vars(parser.parse_args())


clf_l1_LR = LogisticRegression(C=params['tempc'], penalty=params['penalty'], tol=0.01)

clf_l1_LR.fit(X, y)


coef_l1_LR = clf_l1_LR.coef_.ravel()


sparsity_l1_LR = np.mean(coef_l1_LR == 0) * 100


# Save result
_id = params['_id']
if not os.path.exists(_id):
    os.makedirs(_id)
with open(os.path.join(_id, 'value.json'), 'w') as outfile:
    json.dump({'_scores': {'score': sparsity_l1_LR}}, outfile)

