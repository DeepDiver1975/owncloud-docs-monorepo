# changed_envvars.py config file
# relevant for each ocis version

# CHANGE according your needs (version comparison):
# 'versionOld' is the base version to compare from
# 'versionNew' is the target version to compare to
# branches are written the follwoing: 'master' or 'x,y' such as '8.1'
versionOld: str    = '8.1'
versionNew: str    = '8.2'

# CHANGE according your needs (for printing, to_version also to identify all other findings that should be excluded)
from_version: str  = '8.1.0'
to_version: str    = '8.2.0'

# CHANGE according your needs (for file names to be created)
# this will create files such as 8.0.0-8.1.0-added, 8.0.0-8.1.0-removed etc.
# this must match which versions you compare.
nameComponent: str = '8.1.0-8.2.0'

# ADD elements of version that have been published so they get EXCLUDED from gathering.
# from version 7 onwards we dont use patch versions anymore - they should be present.
# fix any patch version in the ocis repo first and redo the whole helper process.
# the last excluded entry should be the version you take as comparison base which is 'from_version'.
defaultExcludePattern: list[str] = ['pre5.0', '5.0',
									'6.0', '6.0.0', '6.0.1', '6.1.0', '6.7',
									'7.0', '7.0.0', '7.1.0', '7.2.0', '7.3.0',
									'8.0.0', '8.1.0']

# IMPORTANT: there may be additional unexpected versions that may appear from backporting in ocis which
# must be excluded too. if found, they are printed to the console for furter investigation.
extraExcludePattern: list[str]   = ['8.3.0']

