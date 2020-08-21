# S4S Discovery Data Server

The S4S Discovery application consists of the following components:

1. The Discovery Application Server [<https://github.com/sync-for-science/discovery>]
2. The Discovery FHIR Demo Data Providers [<https://github.com/sync-for-science/discovery-FHIR-data>]
3. **The Discovery Data Server (this package)** [<https://github.com/sync-for-science/discovery-data-server>]

This package sets up the S4S Discovery Data Server as a JSON web service.

All three packages can be installed on the same Linux instance, but the DNS/IP addresses for each component's instance must be known/determined before installation.

## Installation of the Discovery Data Server

Run the **install.sh** script (you must have sudo privileges):

`./install.sh`

The install script will request the following:

- The DNS/IP address of the FHIR Demo Data Providers (defaults to **localhost** if no input given)
- The DNS/IP address & port of the Discovery Application Server (address:port)

## Checking Status

Use a web browser to access the Discovery Data Server JSON web service.
