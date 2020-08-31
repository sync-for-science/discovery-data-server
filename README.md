# S4S Discovery Data Server

The Sync for Science (S4S) Discovery App is an open-source, consumer-focused, experimental reference application being developed to help patients visualize clinical data delivered from FHIR-based APIs (nominally from provider patient portals). The data delivered into Discovery include, but are not limited to, the data required under Meaningful Use Stage 3, the Common Clinical Data Set (CCDS), and access to payor data, including the CMS Blue Button claims and benefit data.

Discovery has been developed by the Sync for Science (S4S) project (<http://syncfor.science>) at Harvard Medical School/Department of Biomedical Research with federal funding provided from CMS and NIH through the All of Us Research Program.

## S4S Discovery Features

- Retrieval of structured clinical data from multiple FHIR servers or via the S4S Procure App.
- User selection of record types, provider sources, and time frame.
- Annotation support to create, edit, view, and remove notes for each item of data.
- Four data views:
   - **Summary View** lists basic data for the patient
   - **Catalog View** lists patient’s unique clinical data by type
   - **Compare View** shows which providers have records of patient’s unique clinical data
   - **Timeline View** shows patient’s detailed clinical and payer data over time

## S4S Discovery Components

The S4S Discovery application consists of the following components:

1. The Discovery FHIR Demo Data Providers [<https://github.com/sync-for-science/discovery-FHIR-data>]
2. **The Discovery Data Server (this package)** [<https://github.com/sync-for-science/discovery-data-server>]
3. The Discovery Application Server [<https://github.com/sync-for-science/discovery>]

This package sets up the S4S Discovery Data Server as a JSON web service.

All three packages can be installed on the same Linux instance, but the DNS/IP addresses for each component's instance must be known/determined before installation.

## Installation of the Discovery Data Server

Verify the target system is current:

    sudo apt update
    sudo apt upgrade

Clone this repository:

    cd ~
    git clone https://github.com/sync-for-science/discovery-data-server
    cd discovery-data-server

Run the **install.sh** script (you must have sudo privileges):

    ./install.sh

The install script will request the following:

- The DNS/IP address of the FHIR Demo Data Providers
- The DNS/IP address & (optional) port of the Discovery Application Server (address:port)

## Checking Status

Use a web browser to access the Discovery Data Server JSON web service.
