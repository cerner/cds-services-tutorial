const express = require('express');
const bodyParser = require('body-parser');
const app = express();

// This is necessary middleware to parse JSON into the incoming request body for POST requests
app.use(bodyParser.json());

/**
 * Security Considerations:
 * - CDS Services must implement CORS in order to be called from a web browser
 */
app.use((request, response, next) => {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Credentials', 'true');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  response.setHeader('Access-Control-Expose-Headers', 'Origin, Accept, Content-Location, ' +
    'Location, X-Requested-With');

  // Pass to next layer of middleware
  next();
});

/**
 * Discovery Endpoint:
 * - A GET request to the discovery endpoint, or URL path ending in '/cds-services'
 * - This function should respond with definitions of each CDS Service for this app in JSON format
 * - See details here: http://cds-hooks.org/#discovery
 */
app.get('/cds-services', (request, response) => {

  // Example service to invoke the patient-view hook
  const patientViewExample = {
    hook: 'patient-view',
    id: 'patient-view-example',
    title: 'Example patient-view CDS Service',
    description: 'Displays the name and gender of the patient',
    prefetch: {
      // Request the Patient FHIR resource for the patient in context, where the EHR fills out the prefetch template
      // See details here: http://cds-hooks.org/#a-performance-tweak
      requestedPatient: 'Patient/{{Patient.id}}'
    }
  };

  // Example service to invoke the medication-prescribe hook
  const medicationPrescribeExample = {
    hook: 'medication-prescribe',
    id: 'medication-prescribe-example',
    title: 'Example medication-prescribe CDS Service',
    description: 'Suggests prescribing Aspirin 81 MG Oral Tablets',
  };

  const discoveryEndpointServices = {
    services: [ patientViewExample, medicationPrescribeExample ]
  };
  response.send(JSON.stringify(discoveryEndpointServices, null, 2));
});

/**
 * Patient View Example Service:
 * - Handles POST requests to our patient-view-example endpoint
 * - This function should respond with an array of card(s) in JSON format for the patient-view hook
 *
 * - Service purpose: Display a patient's first and last name, with a link to the CDS Hooks web page
 */
app.post('/cds-services/patient-view-example', (request, response) => {

  // Parse the request body for the Patient prefetch resource
  const patientResource = request.body.prefetch.requestedPatient.resource;
  const patientViewCard = {
    cards: [
      {
        // Use the patient's First and Last name
        summary: 'Now seeing: ' + patientResource.name[0].given[0] + ' ' + patientResource.name[0].family[0],
        indicator: 'info',
        links: [
          {
            label: 'Learn more about CDS Hooks',
            url: 'http://cds-hooks.org',
            type: 'absolute'
          }
        ]
      }
    ]
  };
  response.send(JSON.stringify(patientViewCard, null, 2));
});

/**
 * Medication Prescribe Example Service:
 * - Handles POST requests to the medication-prescribe-example endpoint
 * - This function should respond with an array of cards in JSON format for the medication-prescribe hook
 *
 * - Service purpose: Upon a provider choosing a medication to prescribe, display a suggestion for the
 *                    provider to change their chosen medication to the service-recommended Aspirin 81 MG Oral Tablet,
 *                    or display text that affirms the provider is currently prescribing the service-recommended Aspirin
 */
app.post('/cds-services/medication-prescribe-example', (request, response) => {

  // Parse the request body for the FHIR context provided by the EHR. In this case, the MedicationOrder resource
  const context = request.body.context[0];

  // Check if a medication was chosen by the provider to be ordered
  if (context.medicationCodeableConcept) {
    const responseCard = createMedicationResponseCard(context); // see function below for more details
    response.send(JSON.stringify(responseCard, null, 2));
  }
  response.status(200);
});

/**
 * Creates a Card array based upon the medication chosen by the provider in the request context
 * @param context - The FHIR context of the medication being ordered by the provider
 * @returns {{cards: *[]}} - Either a card with the suggestion to switch medication or a textual info card
 */
function createMedicationResponseCard(context) {
  const providerOrderedMedication = context.medicationCodeableConcept.coding[0].code;

  // Check if medication being ordered is our recommended Aspirin 81 MG Oral Tablet
  if (providerOrderedMedication === '243670') {
    // Return this card if the provider has already chosen this specific medication to prescribe,
    // or the provider has chosen the suggestion to switch to this specific medication already
    return {
      cards: [
        {
          summary: 'Currently prescribing a low-dose Aspirin',
          indicator: 'info'
        }
      ]
    };
  } else {
    // 1. Copy the current MedicationOrder resource the provider intends to prescribe
    // 2. Change the medication being ordered by the provider to our recommended Aspirin 81 MG Oral Tablet
    // 3. Add a suggestion to a card to replace the provider's MedicationOrder resource with the CDS Service
    //    copy instead, if the provider clicks on the suggestion button
    let newMedicationOrder = context;
    newMedicationOrder.medicationCodeableConcept = {
      text: 'Aspirin 81 MG Oral Tablet',
      coding: [
        {
          display: 'Aspirin 81 MG Oral Tablet',
          system: 'http://www.nlm.nih.gov/research/umls/rxnorm',
          code: '243670'
        }
      ]
    };
    return {
      cards: [
        {
          summary: 'Reduce cardiovascular risks, prescribe daily 81 MG Aspirin',
          indicator: 'warning',
          suggestions: [
            {
              label: 'Switch to low-dose Aspirin',
              actions: [
                {
                  type: 'create',
                  resource: newMedicationOrder
                }
              ]
            }
          ],
          source: {
            label: 'Learn more about Suggestions',
            url: 'http://cds-hooks.org/#cds-service-response'
          }
        }
      ]
    };
  }
}

// Here is where we define the port for the localhost server to setup
app.listen(3000);
