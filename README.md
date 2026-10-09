# LOGIAID — Disruption-Aware Logistics Planning

LOGIAID is a logistics planning and decision-support system designed to help logistics operators respond to shipment disruptions, evaluate their impact, prioritize affected shipments, and recommend alternative recovery actions.

## Problem Statement

Unexpected disruptions such as route blockages, delays, and other operational issues can affect delivery schedules, increase costs, and make logistics decisions difficult. LOGIAID aims to support faster, more informed recovery planning.

## Key Features

* **Disruption Management:** Record and analyze shipment disruptions.
* **Impact Analysis:** Evaluate how disruptions affect shipments and deliveries.
* **Priority Management:** Help operators prioritize affected shipments.
* **Alternative Route Planning:** Explore alternative routes and recovery actions.
* **Recovery Recommendations:** Present suggested actions for operator review and approval.
* **Driver Workflow:** Support shipment updates and driver-reported issues.
* **Customer Tracking:** Provide shipment status and estimated delivery information where available.
* **Role-Based Workflows:** Support operator, driver, and customer interactions.
* **Profile Management:** Manage user profile information.
* **PostgreSQL Integration:** Store application and logistics data in a database.

## Technology Stack

### Frontend

* React
* TypeScript
* Vite
* Tailwind CSS

### Backend

* Python
* FastAPI

### Database

* PostgreSQL

### Maps and Routing

* React Leaflet
* OpenStreetMap
* OSRM
* Nominatim

## System Workflow

Disruption Input → Impact Analysis → Priority Assessment → Alternative Actions → Recommendation → Operator Approval → Shipment Updates → Delivery Tracking

## Project Structure

```text
LOGIAID/
├── frontend/
├── backend/
├── .gitignore
└── README.md
```

Additional files and folders may be present in the repository.

## Prerequisites

* Python 3
* Node.js and npm
* PostgreSQL
* Git

## Local Setup

### 1. Clone the Repository

```bash
git clone https://github.com/nathancarrick/RUNTIME-ERRORS.git
cd RUNTIME-ERRORS
```

### 2. Configure the Backend

Open a terminal in the project folder and navigate to the backend:

```bash
cd backend
```

Create and activate a Python virtual environment if one does not already exist. Install the Python packages required by the project.

Configure the database connection using local environment variables. Create the PostgreSQL database and configure its connection details before starting the API.

**Do not commit your `.env` file, database passwords, or API keys.**

### 3. Start the Backend

From the backend directory, run:

```bash
python -m uvicorn main:app --reload --port 8000
```

When the API starts successfully, open:

http://127.0.0.1:8000/docs

### 4. Start the Frontend

Open a second terminal and navigate to the frontend directory:

```bash
cd frontend
npm install
npm run dev
```

Open the local URL printed by Vite in the terminal.

## Security Notes

* Keep credentials and API keys in local environment variables.
* Do not upload `.env` files or private user data.
* Validate uploaded files and user input.
* Use appropriate authentication and authorization for protected operations.

## Project Status

LOGIAID is an ongoing project. Available features and external service integrations depend on the current implementation and configuration.

## Repository

https://github.com/nathancarrick/RUNTIME-ERRORS
